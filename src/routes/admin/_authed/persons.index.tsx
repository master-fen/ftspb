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
import { listPersons, softDeletePerson } from "@/lib/federation-person-server-fn";
import { AdminBackLink } from "./-components/AdminBackLink";

export const Route = createFileRoute("/admin/_authed/persons/")({
  component: AdminPersonsList,
});

type StatusFilter = "all" | "draft" | "published";

function AdminPersonsList() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fullName: string } | null>(null);

  const queryKey = ["admin-persons", { status }] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => listPersons({ data: { status: status === "all" ? undefined : status } }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeletePerson({ data: id }),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-persons"] });
    },
    onError: () => toast.error("Не удалось удалить запись"),
  });

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <AdminBackLink to="/admin" label="В админку" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-foreground">Руководство</h1>
          <Button asChild>
            <Link to="/admin/persons/new">Добавить запись</Link>
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
          <p className="text-sm text-muted-foreground">Записей не найдено.</p>
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ФИО</TableHead>
                  <TableHead>Должность</TableHead>
                  <TableHead>Порядок</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-80 truncate font-medium">{row.fullName}</TableCell>
                    <TableCell className="max-w-80 truncate">{row.role}</TableCell>
                    <TableCell>{row.position}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "published" ? "default" : "secondary"}>
                        {row.status === "published" ? "Опубликовано" : "Черновик"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/admin/persons/$id" params={{ id: row.id }}>
                            Редактировать
                          </Link>
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteTarget({ id: row.id, fullName: row.fullName })}
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
        )}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить запись «{deleteTarget?.fullName}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Запись исчезнет со страницы «Руководство» и из этого списка. Отменить это действие
              через админку нельзя.
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
