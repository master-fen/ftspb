import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { z } from "zod";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseDeletedParam,
  parseSectionParam,
  parseSourceParam,
  parseStatusParam,
  parseTextParam,
  parseYearParam,
} from "@/lib/admin-list-paging";
import { parsePageParam } from "@/lib/news-paging";
import {
  listAdminNews,
  listAdminNewsYears,
  restoreNews,
  softDeleteNews,
} from "@/lib/news-admin-server-fn";
import { NewsPagination } from "@/components/site/NewsPagination";
import { AdminBackLink } from "./-components/AdminBackLink";
import { rememberListSearch } from "./-components/admin-list-search-memory";
import { FeaturedNewsManager } from "./-components/FeaturedNewsManager";

const SECTION_LABEL: Record<"federation" | "referees", string> = {
  federation: "Федерация",
  referees: "Коллегия судей",
};

const SOURCE_LABEL: Record<"archive" | "manual", string> = {
  archive: "Архив старого сайта",
  manual: "Заведены на сайте",
};

/**
 * Состояние списка живёт в адресе. Каждое поле — тотальная функция разбора
 * (`src/lib/admin-list-paging.ts`, `src/lib/news-paging.ts`): мусор в адресе
 * даёт умолчание, не ошибку, поэтому `fallback` из `@tanstack/zod-adapter`
 * не нужен вовсе (см. docs/decisions.md).
 */
const searchSchema = z.object({
  q: z.unknown().transform(parseTextParam),
  section: z.unknown().transform(parseSectionParam),
  status: z.unknown().transform(parseStatusParam),
  year: z.unknown().transform(parseYearParam),
  source: z.unknown().transform(parseSourceParam),
  deleted: z.unknown().transform(parseDeletedParam),
  page: z.unknown().transform(parsePageParam),
});

type NewsListSearch = z.infer<typeof searchSchema>;

const SEARCH_DEFAULTS: NewsListSearch = {
  q: "",
  section: "all",
  status: "all",
  year: "all",
  source: "all",
  deleted: false,
  page: 1,
};

export const Route = createFileRoute("/admin/_authed/news/")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
  },
  component: AdminNewsList,
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function AdminNewsList() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();

  const [q, setQ] = useState(search.q);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  // URL → инпут: «Назад» браузера на список с другим q должен обновить поле.
  useEffect(() => {
    setQ(search.q);
  }, [search.q]);

  // Инпут → URL: debounce как раньше, замена записи истории (не push) —
  // ввод не должен плодить записи в истории на каждую паузу набора.
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = q.trim();
      navigate({
        search: (prev) => (prev.q === trimmed ? prev : { ...prev, q: trimmed, page: 1 }),
        replace: true,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [q, navigate]);

  // «К списку» с карточки новости — см. admin-list-search-memory.ts.
  useEffect(() => {
    rememberListSearch("admin-news-list-search", search);
  }, [search]);

  const yearsQuery = useQuery({
    queryKey: ["admin-news-years"],
    queryFn: () => listAdminNewsYears(),
  });

  const queryKey = ["admin-news", search] as const;

  const query = useQuery({
    queryKey,
    queryFn: () =>
      listAdminNews({
        data: {
          q: search.q || undefined,
          section: search.section === "all" ? undefined : search.section,
          status: search.status === "all" ? undefined : search.status,
          includeDeleted: search.deleted,
          year: search.year === "all" ? undefined : search.year,
          source: search.source === "all" ? undefined : search.source,
          page: search.page,
        },
      }),
  });

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-news"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-featured"] }),
    ]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteNews({ data: id }),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
    },
    onError: () => toast.error("Не удалось удалить новость"),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreNews({ data: id }),
    onSuccess: () => invalidate(),
    onError: () => toast.error("Не удалось восстановить новость"),
  });

  const updateFilter = (patch: Partial<Omit<NewsListSearch, "page">>) => {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) });
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <AdminBackLink to="/admin" label="В админку" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-foreground">Новости</h1>
          <Button asChild>
            <Link to="/admin/news/new">Создать новость</Link>
          </Button>
        </header>

        <FeaturedNewsManager />
        <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="news-search">
              Поиск по заголовку и тексту
            </label>
            <Input
              id="news-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Заголовок и текст…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Раздел</span>
            <Select
              value={search.section}
              onValueChange={(value) => updateFilter({ section: value as typeof search.section })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все разделы</SelectItem>
                <SelectItem value="none">Без раздела</SelectItem>
                <SelectItem value="federation">Федерация</SelectItem>
                <SelectItem value="referees">Коллегия судей</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Статус</span>
            <Select
              value={search.status}
              onValueChange={(value) => updateFilter({ status: value as typeof search.status })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="draft">Черновик</SelectItem>
                <SelectItem value="published">Опубликовано</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Год</span>
            <Select
              value={String(search.year)}
              onValueChange={(value) =>
                updateFilter({ year: value === "all" ? "all" : Number(value) })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все годы</SelectItem>
                {(yearsQuery.data ?? []).map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Откуда</span>
            <Select
              value={search.source}
              onValueChange={(value) => updateFilter({ source: value as typeof search.source })}
            >
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="archive">{SOURCE_LABEL.archive}</SelectItem>
                <SelectItem value="manual">{SOURCE_LABEL.manual}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 pb-1.5">
            <Switch
              checked={search.deleted}
              onCheckedChange={(checked) => updateFilter({ deleted: checked })}
            />
            <span className="text-sm font-medium text-foreground">Показывать удалённые</span>
          </label>
        </div>

        {query.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
            <p className="text-sm text-destructive">Не удалось загрузить список новостей.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Повторить
            </Button>
          </div>
        ) : query.isPending ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : query.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Новостей не найдено.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Найдено {query.data.total}</p>
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Заголовок</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead>Раздел</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>На главной</TableHead>
                    <TableHead>Фото</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.items.map((row) => (
                    <TableRow key={row.id} className={row.deletedAt ? "opacity-60" : undefined}>
                      <TableCell className="min-w-52 max-w-lg whitespace-normal font-medium">
                        <Link
                          to="/admin/news/$id"
                          params={{ id: row.id }}
                          className="hover:underline"
                        >
                          {row.title}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(row.publishedAt)}
                      </TableCell>
                      <TableCell>{row.section ? SECTION_LABEL[row.section] : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "published" ? "default" : "secondary"}>
                          {row.status === "published" ? "Опубликовано" : "Черновик"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.featured ? "★ В подборке" : "—"}
                      </TableCell>
                      <TableCell>{row.photoCount}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Действия: ${row.title}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/admin/news/$id" params={{ id: row.id }}>
                                Редактировать
                              </Link>
                            </DropdownMenuItem>
                            {row.status === "published" && !row.deletedAt ? (
                              <DropdownMenuItem asChild>
                                <Link
                                  to="/news/$newsId"
                                  params={{ newsId: row.slug }}
                                  target="_blank"
                                >
                                  Открыть на сайте
                                </Link>
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            {row.deletedAt ? (
                              <DropdownMenuItem
                                disabled={restoreMutation.isPending}
                                onClick={() => restoreMutation.mutate(row.id)}
                              >
                                Восстановить
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget({ id: row.id, title: row.title })}
                              >
                                Удалить
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <NewsPagination page={query.data.page} pageCount={query.data.pageCount} />
          </>
        )}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить новость «{deleteTarget?.title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Новость перестанет отображаться на сайте. Действие можно отменить кнопкой
              «Восстановить» в этом списке.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
