import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getAdminDocument } from "@/lib/documents-server-fn";
import { DocumentForm } from "./-components/DocumentForm";

export const Route = createFileRoute("/admin/_authed/documents/$id")({
  component: AdminDocumentEdit,
});

function AdminDocumentEdit() {
  const { id } = Route.useParams();

  const query = useQuery({
    queryKey: ["admin-document", id],
    queryFn: () => getAdminDocument({ data: id }),
  });

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {query.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
            <p className="text-sm text-destructive">Не удалось загрузить документ.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Повторить
            </Button>
          </div>
        ) : query.isPending ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <DocumentForm mode="edit" document={query.data} />
        )}
      </div>
    </div>
  );
}
