import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, FileText, Image, Paperclip, Save, Video } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
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
  checkSlugAvailable,
  getAdminNews,
  suggestSlug,
  updateNews,
} from "@/lib/news-admin-server-fn";
import { normalizeVideoUrl } from "@/lib/news-video-url";
import { NewsDocumentGallery } from "./-components/NewsDocumentGallery";
import { NewsPhotoGallery } from "./-components/NewsPhotoGallery";
import { AdminBackLink } from "./-components/AdminBackLink";
import { UnsavedChangesDialog } from "./-components/UnsavedChangesDialog";
import { useUnsavedChangesBlocker } from "./-hooks/use-unsaved-changes-blocker";

export const Route = createFileRoute("/admin/_authed/news/$id")({
  component: AdminNewsEdit,
});

const ALLOWED_TAGS_HINT = "p, strong, em, u, a, ul, ol, li, h2, h3, blockquote";

const formSchema = z.object({
  title: z.string().min(1, "Введите заголовок"),
  slug: z.string().min(1, "Введите slug"),
  publishedAt: z.string().min(1, "Укажите дату"),
  section: z.enum(["none", "federation", "referees"]),
  excerpt: z.string(),
  body: z.string(),
  status: z.enum(["draft", "published"]),
  // Подсказка у поля текстом валидатора; сервер (news-admin.ts) проверяет независимо.
  videoUrl: z.string().superRefine((value, ctx) => {
    if (!value.trim()) return;
    const result = normalizeVideoUrl(value);
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
    }
  }),
});

type FormValues = z.infer<typeof formSchema>;

/** "" → null (как excerpt/body); непустое — embed-адрес. Сервер нормализует повторно. */
function videoUrlToPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const result = normalizeVideoUrl(trimmed);
  // ok:false сюда не доходит — formSchema уже отклонила; на всякий случай
  // отдаём сырую строку, её отклонит сервер.
  return result.ok ? result.url : trimmed;
}

function AdminNewsEdit() {
  const { id } = Route.useParams();

  const query = useQuery({
    queryKey: ["admin-news", id],
    queryFn: () => getAdminNews({ data: id }),
  });

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <AdminBackLink to="/admin/news" label="К списку новостей" />
        {query.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
            <p className="text-sm text-destructive">Не удалось загрузить новость.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Повторить
            </Button>
          </div>
        ) : query.isPending ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <NewsEditForm key={id} id={id} news={query.data.news} />
        )}
      </div>
    </div>
  );
}

function NewsEditForm({
  id,
  news,
}: {
  id: string;
  news: {
    slug: string;
    title: string;
    publishedAt: string;
    excerpt: string | null;
    body: string | null;
    section: "federation" | "referees" | null;
    status: "draft" | "published";
    coverPhotoId: string | null;
    featured: boolean;
    featuredOrder: number | null;
    videoUrl: string | null;
  };
}) {
  const queryClient = useQueryClient();
  const [persisted, setPersisted] = useState({ slug: news.slug, status: news.status });
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "error"
  >("idle");
  const [isSuggestingSlug, setIsSuggestingSlug] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentDirty, setDocumentDirty] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: news.title,
      slug: news.slug,
      publishedAt: news.publishedAt,
      section: news.section ?? "none",
      excerpt: news.excerpt ?? "",
      body: news.body ?? "",
      status: news.status,
      videoUrl: news.videoUrl ?? "",
    },
  });

  const {
    formState: { isDirty },
  } = form;
  const blocker = useUnsavedChangesBlocker(
    isDirty || photoBusy || documentBusy || documentDirty,
    true,
  );
  const watchedSlug = form.watch("slug");
  const watchedTitle = form.watch("title");
  const watchedPublishedAt = form.watch("publishedAt");

  useEffect(() => {
    if (watchedSlug === persisted.slug || watchedSlug.length === 0) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const available = await checkSlugAvailable({ data: { slug: watchedSlug, excludeId: id } });
        setSlugStatus(available ? "available" : "taken");
      } catch {
        setSlugStatus("error");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [watchedSlug, persisted.slug, id]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      updateNews({
        data: {
          id,
          input: {
            title: values.title,
            slug: values.slug,
            publishedAt: values.publishedAt,
            section: values.section === "none" ? null : values.section,
            excerpt: values.excerpt.trim() ? values.excerpt : null,
            body: values.body.trim() ? values.body : null,
            status: values.status,
            videoUrl: videoUrlToPayload(values.videoUrl),
          },
        },
      }),
    onSuccess: (_result, values) => {
      toast.success("Изменения сохранены");
      setPersisted({ slug: values.slug, status: values.status });
      // Поле сразу показывает сохранённый (нормализованный) адрес, как после перезагрузки.
      form.reset({ ...values, videoUrl: videoUrlToPayload(values.videoUrl) ?? "" });
      void queryClient.invalidateQueries({ queryKey: ["admin-news"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-featured"] });
    },
    onError: () => toast.error("Не удалось сохранить изменения"),
  });

  const onSubmit = form.handleSubmit(
    (values) => mutation.mutate(values),
    (errors) => {
      if (errors.slug) setAddressOpen(true);
      toast.error("Проверьте поля с ошибками");
    },
  );

  const handleGenerateSlug = async () => {
    setIsSuggestingSlug(true);
    try {
      const slug = await suggestSlug({
        data: { title: watchedTitle, publishedAt: watchedPublishedAt },
      });
      form.setValue("slug", slug, { shouldDirty: true });
    } catch {
      toast.error("Не удалось сгенерировать slug");
    } finally {
      setIsSuggestingSlug(false);
    }
  };

  const showSlugChangeWarning = persisted.status === "published" && watchedSlug !== persisted.slug;

  return (
    <>
      <header className="sticky top-0 z-20 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-4 shadow-sm backdrop-blur">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Редактор новости</h1>
            <Badge variant={persisted.status === "published" ? "default" : "secondary"}>
              {persisted.status === "published" ? "Опубликована" : "Черновик"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground" role="status">
            {mutation.isPending
              ? "Сохраняем изменения…"
              : isDirty
                ? "Есть несохранённые изменения текста и настроек"
                : "Текст и настройки сохранены"}
          </p>
        </div>
        <div className="flex gap-2">
          {persisted.status === "published" ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/news/$newsId" params={{ newsId: persisted.slug }} target="_blank">
                <ExternalLink className="h-4 w-4" />
                На сайте
              </Link>
            </Button>
          ) : null}
          <Button type="submit" form="news-editor" disabled={mutation.isPending || !isDirty}>
            <Save className="h-4 w-4" />
            {mutation.isPending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </header>
      <Form {...form}>
        <form
          id="news-editor"
          onSubmit={onSubmit}
          className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"
          noValidate
        >
          <fieldset
            disabled={mutation.isPending}
            className="min-w-0 space-y-6 rounded-xl border bg-card p-5 md:p-6"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <FileText className="h-5 w-5" />
              Содержание
            </h2>
            <nav aria-label="Разделы редактора" className="flex flex-wrap gap-2 text-sm">
              <a href="#news-photos" className="rounded-lg border px-3 py-2">
                Обложка и фото
              </a>
              <a href="#news-documents" className="rounded-lg border px-3 py-2">
                Документы
              </a>
              <a href="#news-video" className="rounded-lg border px-3 py-2">
                Видео
              </a>
            </nav>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Заголовок</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="excerpt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Анонс</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <p className="text-[0.8rem] text-muted-foreground">
                    Краткое вступление для карточки и начала новости. Обычно достаточно 1–2
                    предложений.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Текст</FormLabel>
                  <FormControl>
                    <Textarea rows={12} {...field} />
                  </FormControl>
                  <p className="text-[0.8rem] text-muted-foreground">
                    Пишите обычным текстом: пустая строка отделяет абзац, перенос строки
                    сохраняется. HTML вручную добавлять не нужно.
                  </p>
                  <details className="text-[0.8rem] text-muted-foreground">
                    <summary className="cursor-pointer">Форматирование архивных новостей</summary>
                    <p className="mt-2">
                      В перенесённых новостях сохранена HTML-разметка: {ALLOWED_TAGS_HINT}. Она
                      задаёт абзацы, ссылки и выделения. Существующие теги можно оставить;
                      неподдерживаемая разметка удаляется при сохранении.
                    </p>
                  </details>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="videoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel id="news-video" className="flex scroll-mt-28 items-center gap-2">
                    <Video className="h-4 w-4" />
                    Видео Kinescope
                  </FormLabel>
                  <FormControl>
                    <Input inputMode="url" placeholder="https://kinescope.io/…" {...field} />
                  </FormControl>
                  <p className="text-[0.8rem] text-muted-foreground">
                    Скопируйте ссылку «Поделиться» из Kinescope
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <details
              open={addressOpen}
              onToggle={(event) => setAddressOpen(event.currentTarget.open)}
              className="rounded-lg border p-4"
            >
              <summary className="cursor-pointer text-sm font-medium">
                Адрес страницы и дополнительные настройки
              </summary>
              <div className="mt-4">
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Адрес новости</FormLabel>
                      <div className="flex flex-wrap gap-2">
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSuggestingSlug}
                          onClick={handleGenerateSlug}
                        >
                          Из заголовка
                        </Button>
                      </div>
                      {slugStatus === "checking" ? (
                        <p className="text-[0.8rem] text-muted-foreground">Проверяем занятость…</p>
                      ) : slugStatus === "taken" ? (
                        <p className="text-[0.8rem] font-medium text-destructive">
                          Такой slug уже используется
                        </p>
                      ) : slugStatus === "available" ? (
                        <p className="text-[0.8rem] text-muted-foreground">Свободен</p>
                      ) : slugStatus === "error" ? (
                        <p className="text-[0.8rem] text-muted-foreground">
                          Не удалось проверить занятость
                        </p>
                      ) : null}
                      {showSlugChangeWarning ? (
                        <Alert variant="destructive">
                          <AlertDescription>
                            Новость опубликована — при смене slug старая ссылка перестанет работать.
                          </AlertDescription>
                        </Alert>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </details>
          </fieldset>
          <fieldset
            disabled={mutation.isPending}
            className="space-y-5 rounded-xl border bg-card p-5 lg:sticky lg:top-28"
          >
            <h2 className="text-lg font-semibold">Публикация</h2>
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

            <FormField
              control={form.control}
              name="publishedAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Дата</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <p className="text-[0.8rem] text-muted-foreground">
                    Дата в будущем не откладывает публикацию — новость появится сразу.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="section"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Раздел</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Без раздела</SelectItem>
                      <SelectItem value="federation">Федерация</SelectItem>
                      <SelectItem value="referees">Коллегия судей</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t pt-4">
              <p className="text-sm font-medium">Главные новости</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Три позиции на главной странице выбираются вместе в списке новостей.
              </p>
              <Button type="button" variant="outline" className="mt-3 w-full" asChild>
                <Link to="/admin/news">Настроить главные</Link>
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Кнопка «Сохранить» применяет текст и настройки публикации. Фотографии и документы ниже
              сохраняются отдельно.
            </p>
          </fieldset>
        </form>
      </Form>
      <div className="mt-6 space-y-6 lg:mr-[304px]">
        <section id="news-photos" className="scroll-mt-28 rounded-xl border bg-card p-5 md:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Image className="h-5 w-5" />
            Обложка и фотографии
          </h2>
          <NewsPhotoGallery
            newsId={id}
            coverPhotoId={news.coverPhotoId}
            onBusyChange={setPhotoBusy}
          />
        </section>
        <section id="news-documents" className="scroll-mt-28 rounded-xl border bg-card p-5 md:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Paperclip className="h-5 w-5" />
            Документы новости
          </h2>
          <NewsDocumentGallery
            newsId={id}
            newsTitle={news.title}
            newsPublishedAt={news.publishedAt}
            newsSection={news.section}
            onBusyChange={setDocumentBusy}
            onDirtyChange={setDocumentDirty}
          />
        </section>
      </div>
      <UnsavedChangesDialog blocker={blocker} />
    </>
  );
}
