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
import { Textarea } from "@/components/ui/textarea";
import {
  checkSlugAvailable,
  getAdminNews,
  suggestSlug,
  updateNews,
} from "@/lib/news-admin-server-fn";

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
    },
  });

  const {
    formState: { isDirty },
  } = form;
  const watchedSlug = form.watch("slug");
  const watchedTitle = form.watch("title");
  const watchedPublishedAt = form.watch("publishedAt");

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

            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Сохраняем…" : "Сохранить"}
            </Button>
          </form>
        </Form>

        <div className="mt-8 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Фотографии — следующий шаг
        </div>
      </CardContent>
    </Card>
  );
}
