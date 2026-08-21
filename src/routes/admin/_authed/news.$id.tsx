import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  checkSlugAvailable,
  getAdminNews,
  suggestSlug,
  updateNews,
} from "@/lib/news-admin-server-fn";
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
  featured: z.boolean(),
  featuredOrder: z.number().int().min(0),
});

type FormValues = z.infer<typeof formSchema>;

function AdminNewsEdit() {
  const { id } = Route.useParams();

  const query = useQuery({
    queryKey: ["admin-news", id],
    queryFn: () => getAdminNews({ data: id }),
  });

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl">
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
          <NewsEditForm id={id} news={query.data.news} />
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
  };
}) {
  const [persisted, setPersisted] = useState({ slug: news.slug, status: news.status });
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "error"
  >("idle");
  const [isSuggestingSlug, setIsSuggestingSlug] = useState(false);

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
      featured: news.featured,
      featuredOrder: news.featuredOrder ?? 0,
    },
  });

  const {
    formState: { isDirty },
  } = form;
  const blocker = useUnsavedChangesBlocker(isDirty);
  const watchedSlug = form.watch("slug");
  const watchedTitle = form.watch("title");
  const watchedPublishedAt = form.watch("publishedAt");
  const watchedFeatured = form.watch("featured");

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
            featured: values.featured,
            featuredOrder: values.featured ? values.featuredOrder : null,
          },
        },
      }),
    onSuccess: (_result, values) => {
      toast.success("Изменения сохранены");
      setPersisted({ slug: values.slug, status: values.status });
      form.reset(values);
    },
    onError: () => toast.error("Не удалось сохранить изменения"),
  });

  const onSubmit = form.handleSubmit((values) => mutation.mutate(values));

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
    <Card>
      <CardHeader>
        <CardTitle>Редактирование новости</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
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
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSuggestingSlug}
                      onClick={handleGenerateSlug}
                    >
                      Сгенерировать из заголовка
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

            <FormField
              control={form.control}
              name="excerpt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Анонс</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
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
                    Разрешённые теги: {ALLOWED_TAGS_HINT}. Остальное будет вырезано при сохранении.
                  </p>
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

            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="text-sm font-medium text-foreground">Главная страница</h3>

              <FormField
                control={form.control}
                name="featured"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal">Показывать на главной странице</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="featuredOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Порядок</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        disabled={!watchedFeatured}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        className="w-24"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <p className="text-[0.8rem] text-muted-foreground">
                На главной показываются три новости. Порядок 0 — большая карточка слева, 1 и 2 —
                маленькие справа. Остальные отмеченные остаются в общей ленте.
              </p>
            </div>

            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Сохраняем…" : "Сохранить"}
            </Button>
          </form>
        </Form>

        <NewsPhotoGallery newsId={id} coverPhotoId={news.coverPhotoId} />
        <NewsDocumentGallery
          newsId={id}
          newsTitle={news.title}
          newsPublishedAt={news.publishedAt}
          newsSection={news.section}
        />
      </CardContent>
      <UnsavedChangesDialog blocker={blocker} />
    </Card>
  );
}
