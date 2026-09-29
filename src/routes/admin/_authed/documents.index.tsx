import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { toast } from "sonner";
import { z } from "zod";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseDocumentSectionParam,
  parseStatusParam,
  parseTextParam,
} from "@/lib/admin-list-paging";
import { parsePageParam } from "@/lib/news-paging";
import { listAdminDocuments, softDeleteDocument } from "@/lib/documents-server-fn";
import { formatFileSize } from "@/lib/format-file-size";
import { getFileExtension } from "@/lib/image-validation";
import { NewsPagination } from "@/components/site/NewsPagination";
import { AdminBackLink } from "./-components/AdminBackLink";
import { rememberListSearch } from "./-components/admin-list-search-memory";

const SECTION_LABEL: Record<"federation" | "referees", string> = {
  federation: "Федерация",
  referees: "Коллегия судей",
};

/** См. news.index.tsx — тот же приём: тотальные parse*-функции, без zod-adapter. */
const searchSchema = z.object({
  q: z.unknown().transform(parseTextParam),
  section: z.unknown().transform(parseDocumentSectionParam),
  status: z.unknown().transform(parseStatusParam),
  page: z.unknown().transform(parsePageParam),
});

type DocumentsListSearch = z.infer<typeof searchSchema>;

const SEARCH_DEFAULTS: DocumentsListSearch = {
  q: "",
  section: "all",
  status: "all",
  page: 1,
};

export const Route = createFileRoute("/admin/_authed/documents/")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
  },
  component: AdminDocumentsList,
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function AdminDocumentsList() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();

  const [q, setQ] = useState(search.q);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    setQ(search.q);
  }, [search.q]);

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

  useEffect(() => {
    rememberListSearch("admin-documents-list-search", search);
  }, [search]);

  const queryKey = ["admin-documents", search] as const;

  const query = useQuery({
    queryKey,
    queryFn: () =>
      listAdminDocuments({
        data: {
          q: search.q || undefined,
          section: search.section === "all" ? undefined : search.section,
          status: search.status === "all" ? undefined : search.status,
          page: search.page,
        },
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteDocument({ data: id }),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-documents"] });
    },
    onError: () => toast.error("Не удалось удалить документ"),
  });

  const updateFilter = (patch: Partial<Omit<DocumentsListSearch, "page">>) => {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) });
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <AdminBackLink to="/admin" label="В админку" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-foreground">Документы</h1>
          <Button asChild>
            <Link to="/admin/documents/new">Добавить документ</Link>
          </Button>
        </header>

        <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="documents-search">
              Поиск по названию
            </label>
            <Input
              id="documents-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Название документа…"
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
                <SelectItem value="published">Опубликован</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {query.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
            <p className="text-sm text-destructive">Не удалось загрузить список документов.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Повторить
            </Button>
          </div>
        ) : query.isPending ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : query.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Документов не найдено.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Найдено {query.data.total}</p>
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Раздел</TableHead>
                    <TableHead>Дата документа</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Размер</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>В библиотеке</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-80 truncate font-medium">{row.title}</TableCell>
                      <TableCell>{row.section ? SECTION_LABEL[row.section] : "—"}</TableCell>
                      <TableCell>{formatDate(row.documentDate)}</TableCell>
                      <TableCell>{getFileExtension(row.fileName).toUpperCase()}</TableCell>
                      <TableCell>{formatFileSize(row.sizeBytes)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "published" ? "default" : "secondary"}>
                          {row.status === "published" ? "Опубликован" : "Черновик"}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.inLibrary ? "Да" : "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={row.url} target="_blank" rel="noreferrer">
                              Открыть файл
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/admin/documents/$id" params={{ id: row.id }}>
                              Редактировать
                            </Link>
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteTarget({ id: row.id, title: row.title })}
                          >
                            Удалить
                          </Button>
                        </div>
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
            <AlertDialogTitle>Удалить документ «{deleteTarget?.title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Документ исчезнет из библиотеки документов и из всех новостей, к которым прикреплён.
              Отменить это действие через админку нельзя.
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
