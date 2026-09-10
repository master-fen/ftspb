import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DATE_PRECISIONS,
  formatEventDateLong,
  normalizeAnchor,
  type DatePrecision,
} from "@/lib/event-date";
import { EVENT_TYPES, type EventType } from "@/lib/event-type";
import { checkSlugAvailable, createEvent, suggestSlug, updateEvent } from "@/lib/events-server-fn";
import { useUnsavedChangesBlocker } from "../-hooks/use-unsaved-changes-blocker";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

export type AdminEvent = {
  id: string;
  slug: string;
  title: string;
  type: EventType;
  startsOn: string;
  startsTime: string | null;
  datePrecision: DatePrecision;
  location: string | null;
  description: string | null;
  status: "draft" | "published";
};

type EventFormProps = { mode: "create" } | { mode: "edit"; event: AdminEvent };

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

/**
 * Схема формы — только для подсказок в UI. Серверная валидация
 * (src/lib/event-input.ts) применяется независимо от неё; её ошибки форма
 * показывает текстом, который вернул сервер. Про Устав форма не знает: за
 * его соблюдение отвечает секретарь.
 *
 * Дата в форме разложена на части (год/месяц/квартал/полугодие/день), потому
 * что при разной точности от пользователя нужны разные поля. На сервер всегда
 * уходит один `startsOn` в формате YYYY-MM-DD.
 */
const formSchema = z.object({
  title: z.string().trim().min(1, "Введите название"),
  slug: z.string().trim().min(1, "Введите адрес"),
  type: z.enum(["general_meeting", "board", "audit", "other"]),
  datePrecision: z.enum(["day", "month", "quarter", "half_year", "year"]),
  day: z.string(),
  time: z.string(),
  year: z.coerce
    .number({ invalid_type_error: "Введите год" })
    .int("Только целое число")
    .min(1900, "Год не раньше 1900")
    .max(2100, "Год не позже 2100"),
  month: z.coerce.number().int().min(1).max(12),
  quarter: z.coerce.number().int().min(1).max(4),
  halfYear: z.coerce.number().int().min(1).max(2),
  location: z.string(),
  description: z.string(),
  status: z.enum(["draft", "published"]),
});

type FormValues = z.infer<typeof formSchema>;

/** Части формы → якорь YYYY-MM-DD. Сервер нормализует его повторно. */
function valuesToStartsOn(values: FormValues): string {
  const year = String(values.year).padStart(4, "0");
  switch (values.datePrecision) {
    case "day":
      return values.day;
    case "month":
      return `${year}-${String(values.month).padStart(2, "0")}-01`;
    case "quarter":
      return `${year}-${String((values.quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
    case "half_year":
      return `${year}-${values.halfYear === 1 ? "01" : "07"}-01`;
    case "year":
      return `${year}-01-01`;
  }
}

function toPayload(values: FormValues) {
  return {
    slug: values.slug,
    title: values.title,
    type: values.type,
    startsOn: valuesToStartsOn(values),
    startsTime: values.datePrecision === "day" && values.time.trim() ? values.time : null,
    datePrecision: values.datePrecision,
    location: values.location.trim() ? values.location : null,
    description: values.description.trim() ? values.description : null,
    status: values.status,
  };
}

function defaultsFromEvent(row: AdminEvent): FormValues {
  const [yearPart, monthPart] = row.startsOn.split("-");
  const month = Number(monthPart);
  return {
    title: row.title,
    slug: row.slug,
    type: row.type,
    datePrecision: row.datePrecision,
    day: row.startsOn,
    time: row.startsTime ? row.startsTime.slice(0, 5) : "",
    year: Number(yearPart),
    month,
    quarter: Math.floor((month - 1) / 3) + 1,
    halfYear: month <= 6 ? 1 : 2,
    location: row.location ?? "",
    description: row.description ?? "",
    status: row.status,
  };
}

function createDefaults(): FormValues {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = `${year}-${String(month).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return {
    title: "",
    slug: "",
    type: "board",
    datePrecision: "day",
    day,
    time: "",
    year,
    month,
    quarter: Math.floor((month - 1) / 3) + 1,
    halfYear: month <= 6 ? 1 : 2,
    location: "",
    description: "",
    status: "draft",
  };
}

export function EventForm(props: EventFormProps) {
  const navigate = useNavigate();
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "error"
  >("idle");
  const [isSuggestingSlug, setIsSuggestingSlug] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: props.mode === "create" ? createDefaults() : defaultsFromEvent(props.event),
  });

  const {
    formState: { isDirty },
  } = form;
  const blocker = useUnsavedChangesBlocker(isDirty);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const persistedSlug = props.mode === "edit" ? props.event.slug : null;
  const excludeId = props.mode === "edit" ? props.event.id : undefined;
  const watchedSlug = form.watch("slug");
  const precision = form.watch("datePrecision");

  useEffect(() => {
    if (watchedSlug === persistedSlug || watchedSlug.trim().length === 0) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const available = await checkSlugAvailable({ data: { slug: watchedSlug, excludeId } });
        setSlugStatus(available ? "available" : "taken");
      } catch {
        setSlugStatus("error");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [watchedSlug, persistedSlug, excludeId]);

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => createEvent({ data: toPayload(values) }),
    onSuccess: ({ id }, values) => {
      form.reset(values);
      blocker.bypassNextNavigation();
      navigate({ to: "/admin/events/$id", params: { id } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Не удалось создать событие"),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; values: FormValues }) =>
      updateEvent({ data: { id: input.id, input: toPayload(input.values) } }),
    onSuccess: (_result, input) => {
      toast.success("Изменения сохранены");
      form.reset(input.values);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить изменения"),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const onSubmit = form.handleSubmit((values) => {
    if (props.mode === "create") {
      createMutation.mutate(values);
    } else {
      updateMutation.mutate({ id: props.event.id, values });
    }
  });

  const handleSuggestSlug = async () => {
    setIsSuggestingSlug(true);
    try {
      const values = form.getValues();
      const slug = await suggestSlug({
        data: { title: values.title, startsOn: valuesToStartsOn(values) },
      });
      form.setValue("slug", slug, { shouldDirty: true });
    } catch {
      toast.error("Не удалось подобрать адрес");
    } finally {
      setIsSuggestingSlug(false);
    }
  };

  const values = form.watch();

  const previewStartsOn = (() => {
    try {
      return normalizeAnchor(valuesToStartsOn(values), values.datePrecision);
    } catch {
      return null;
    }
  })();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {props.mode === "create" ? "Новое событие" : "Редактирование события"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-6" noValidate>
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Адрес (slug)</FormLabel>
                    <div className="flex flex-wrap gap-2">
                      <FormControl>
                        <Input className="flex-1" {...field} />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSuggestingSlug}
                        onClick={handleSuggestSlug}
                      >
                        Подобрать
                      </Button>
                    </div>
                    <FormDescription>
                      {slugStatus === "checking"
                        ? "Проверяем…"
                        : slugStatus === "taken"
                          ? "Такой адрес уже используется"
                          : slugStatus === "available"
                            ? "Адрес свободен"
                            : slugStatus === "error"
                              ? "Не удалось проверить адрес"
                              : "Латинские буквы, цифры и дефисы между ними"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Тип</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EVENT_TYPES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="datePrecision"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Точность даты</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DATE_PRECISIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Если день ещё не назначен, укажите месяц, квартал, полугодие или год.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Набор полей под выбранную точность. Год и месяц переносятся
                  между режимами: значения формы не сбрасываются. */}
              {precision === "day" ? (
                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="day"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Дата</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Время (необязательно)</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Год</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {precision === "month" ? (
                    <FormField
                      control={form.control}
                      name="month"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Месяц</FormLabel>
                          <Select
                            value={String(field.value)}
                            onValueChange={(value) => field.onChange(Number(value))}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {MONTHS.map((label, index) => (
                                <SelectItem key={label} value={String(index + 1)}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}
                  {precision === "quarter" ? (
                    <FormField
                      control={form.control}
                      name="quarter"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Квартал</FormLabel>
                          <Select
                            value={String(field.value)}
                            onValueChange={(value) => field.onChange(Number(value))}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">I квартал</SelectItem>
                              <SelectItem value="2">II квартал</SelectItem>
                              <SelectItem value="3">III квартал</SelectItem>
                              <SelectItem value="4">IV квартал</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}
                  {precision === "half_year" ? (
                    <FormField
                      control={form.control}
                      name="halfYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Полугодие</FormLabel>
                          <Select
                            value={String(field.value)}
                            onValueChange={(value) => field.onChange(Number(value))}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">1-е полугодие</SelectItem>
                              <SelectItem value="2">2-е полугодие</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}
                </div>
              )}

              {previewStartsOn ? (
                <p className="text-sm text-muted-foreground">
                  На сайте: {formatEventDateLong(previewStartsOn, precision, values.time || null)}
                </p>
              ) : null}

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Место</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Повестка</FormLabel>
                    <FormControl>
                      <Textarea rows={6} {...field} />
                    </FormControl>
                    <FormDescription>Обычный текст, без разметки.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Статус</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Черновик</SelectItem>
                        <SelectItem value="published">Опубликовано</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? "Сохраняем…"
                  : props.mode === "create"
                    ? "Создать событие"
                    : "Сохранить изменения"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <UnsavedChangesDialog blocker={blocker} />
    </>
  );
}
