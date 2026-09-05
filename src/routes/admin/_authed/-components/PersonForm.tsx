import { useEffect } from "react";
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
import { createPerson, updatePerson } from "@/lib/federation-person-server-fn";
import { useUnsavedChangesBlocker } from "../-hooks/use-unsaved-changes-blocker";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

type AdminPerson = {
  id: string;
  fullName: string;
  role: string;
  bio: string | null;
  phone: string | null;
  email: string | null;
  position: number;
  status: "draft" | "published";
};

type PersonFormProps = { mode: "create" } | { mode: "edit"; person: AdminPerson };

/**
 * Схема формы — только для подсказок в UI. Серверная валидация
 * (src/lib/federation-person-input.ts) применяется независимо от неё.
 */
const formSchema = z.object({
  fullName: z.string().trim().min(1, "Введите ФИО"),
  role: z.string().trim().min(1, "Введите должность"),
  bio: z.string(),
  phone: z.string(),
  email: z.string().trim().email("Некорректный email").or(z.literal("")),
  position: z.coerce
    .number({ invalid_type_error: "Введите число" })
    .int("Только целое число")
    .min(0, "Не меньше нуля"),
  status: z.enum(["draft", "published"]),
});

type FormValues = z.infer<typeof formSchema>;

/** Пустые строки необязательных полей → null: сервер хранит NULL, не "". */
function toPayload(values: FormValues) {
  return {
    fullName: values.fullName,
    role: values.role,
    bio: values.bio.trim() ? values.bio : null,
    phone: values.phone.trim() ? values.phone : null,
    email: values.email.trim() ? values.email : null,
    position: values.position,
    status: values.status,
  };
}

export function PersonForm(props: PersonFormProps) {
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues:
      props.mode === "create"
        ? { fullName: "", role: "", bio: "", phone: "", email: "", position: 0, status: "draft" }
        : {
            fullName: props.person.fullName,
            role: props.person.role,
            bio: props.person.bio ?? "",
            phone: props.person.phone ?? "",
            email: props.person.email ?? "",
            position: props.person.position,
            status: props.person.status,
          },
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

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => createPerson({ data: toPayload(values) }),
    onSuccess: ({ id }, values) => {
      form.reset(values);
      blocker.bypassNextNavigation();
      navigate({ to: "/admin/persons/$id", params: { id } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Не удалось создать запись"),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; values: FormValues }) =>
      updatePerson({ data: { id: input.id, input: toPayload(input.values) } }),
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
      updateMutation.mutate({ id: props.person.id, values });
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.mode === "create" ? "Новая запись" : "Редактирование записи"}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ФИО</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Должность</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Биография</FormLabel>
                  <FormControl>
                    <Textarea rows={5} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Телефон</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Порядок</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={1} {...field} />
                    </FormControl>
                    <FormDescription>Меньше — выше на странице.</FormDescription>
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
            </div>

            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Сохраняем…" : props.mode === "create" ? "Создать" : "Сохранить"}
            </Button>
          </form>
        </Form>
      </CardContent>
      <UnsavedChangesDialog blocker={blocker} />
    </Card>
  );
}
