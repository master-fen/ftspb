import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { eventYear, formatEventDateShort } from "@/lib/event-date";
import { eventTypeLabel } from "@/lib/event-type";
import { listAdminEvents, restoreEvent, softDeleteEvent } from "@/lib/events-server-fn";
import { AdminBackLink } from "./-components/AdminBackLink";

export const Route = createFileRoute("/admin/_authed/events/")({
  component: AdminEventsList,
});

type StatusFilter = "all" | "draft" | "published";

function AdminEventsList() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const queryKey = ["admin-events", { status, includeDeleted }] as const;

  const query = useQuery({
    queryKey,
    queryFn: () =>
      listAdminEvents({
        data: { status: status === "all" ? undefined : status, includeDeleted },
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-events"] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteEvent({ data: id }),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
    },
    onError: () => toast.error("Не удалось удалить событие"),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreEvent({ data: id }),
    onSuccess: invalidate,
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Не удалось восстановить событие"),
  });

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <AdminBackLink to="/admin" label="В админку" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-foreground">События</h1>
          <Button asChild>
            <Link to="/admin/events/new">Добавить событие</Link>
          </Button>
        </header>

        <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
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
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={includeDeleted}
              onCheckedChange={(checked) => setIncludeDeleted(checked === true)}
            />
            Показывать удалённые
          </label>
        </div>

        {query.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
            <p className="text-sm text-destructive">Не удалось загрузить список.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Повторить
            </Button>
          </div>
        ) : query.isPending ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : query.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Событий не найдено.</p>
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((row) => (
                  <TableRow key={row.id} className={row.deletedAt ? "opacity-60" : undefined}>
                    <TableCell className="whitespace-nowrap">
                      {/* Короткая подпись без года плюс год отдельно: при
                          точности «Год» короткая подпись и есть год. */}
                      {row.datePrecision === "year"
                        ? formatEventDateShort(row.startsOn, row.datePrecision)
                        : `${formatEventDateShort(row.startsOn, row.datePrecision)} ${eventYear(row.startsOn)}`}
                    </TableCell>
                    <TableCell className="max-w-80 truncate font-medium">{row.title}</TableCell>
                    <TableCell>{eventTypeLabel(row.type)}</TableCell>
                    <TableCell>
                      {row.deletedAt ? (
                        <Badge variant="outline">Удалено</Badge>
                      ) : (
                        <Badge variant={row.status === "published" ? "default" : "secondary"}>
                          {row.status === "published" ? "Опубликовано" : "Черновик"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
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
                          <>
                            <Button variant="outline" size="sm" asChild>
                              <Link to="/admin/events/$id" params={{ id: row.id }}>
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
                          </>
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
            <AlertDialogTitle>Удалить событие «{deleteTarget?.title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Событие исчезнет из этого списка и из выбора в редакторе новости. Его адрес
              освободится. Восстановить можно здесь же, включив «Показывать удалённые».
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
