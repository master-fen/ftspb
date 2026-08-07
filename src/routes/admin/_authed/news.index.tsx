import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
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
import { listAdminNews, restoreNews, softDeleteNews } from "@/lib/news-admin-server-fn";

export const Route = createFileRoute("/admin/_authed/news/")({
  component: AdminNewsList,
});

type SectionFilter = "all" | "none" | "federation" | "referees";
type StatusFilter = "all" | "draft" | "published";

const SECTION_LABEL: Record<"federation" | "referees", string> = {
  federation: "Федерация",
  referees: "Коллегия судей",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function AdminNewsList() {
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [section, setSection] = useState<SectionFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const queryKey = ["admin-news", { q: debouncedQ, section, status, includeDeleted }] as const;

  const query = useQuery({
    queryKey,
    queryFn: () =>
      listAdminNews({
        data: {
          q: debouncedQ || undefined,
          section: section === "all" ? undefined : section,
          status: status === "all" ? undefined : status,
          includeDeleted,
        },
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-news"] });

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

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-foreground">Новости</h1>
          <Button asChild>
            <Link to="/admin/news/new">Создать новость</Link>
          </Button>
        </header>

        <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="news-search">
              Поиск по заголовку
            </label>
            <Input
              id="news-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Заголовок…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Раздел</span>
            <Select value={section} onValueChange={(value) => setSection(value as SectionFilter)}>
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
            <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
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

          <label className="flex items-center gap-2 pb-1.5">
            <Switch checked={includeDeleted} onCheckedChange={setIncludeDeleted} />
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
        ) : query.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Новостей не найдено.</p>
        ) : (
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
                {query.data.map((row) => (
                  <TableRow key={row.id} className={row.deletedAt ? "opacity-60" : undefined}>
                    <TableCell className="max-w-80 truncate font-medium">{row.title}</TableCell>
                    <TableCell>{formatDate(row.publishedAt)}</TableCell>
                    <TableCell>{row.section ? SECTION_LABEL[row.section] : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "published" ? "default" : "secondary"}>
                        {row.status === "published" ? "Опубликовано" : "Черновик"}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.featured ? "Да" : "—"}</TableCell>
                    <TableCell>{row.photoCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/admin/news/$id" params={{ id: row.id }}>
                            Редактировать
                          </Link>
                        </Button>
                        {row.status === "published" && !row.deletedAt ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/news/$newsId" params={{ newsId: row.slug }} target="_blank">
                              Открыть на сайте
                            </Link>
                          </Button>
                        ) : null}
                        {row.deletedAt ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={restoreMutation.isPending}
                            onClick={() => restoreMutation.mutate(row.id)}
                          >
                            Восстановить
                          </Button>
                        ) : (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteTarget({ id: row.id, title: row.title })}
                          >
                            Удалить
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
