import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getPersonById } from "@/lib/federation-person-server-fn";
import { AdminBackLink } from "./-components/AdminBackLink";
import { PersonForm } from "./-components/PersonForm";
import { PersonPhotoSection } from "./-components/PersonPhotoSection";

export const Route = createFileRoute("/admin/_authed/persons/$id")({
  component: AdminPersonEdit,
});

function AdminPersonEdit() {
  const { id } = Route.useParams();

  const query = useQuery({
    queryKey: ["admin-person", id],
    queryFn: () => getPersonById({ data: id }),
  });

  return (
    <div className="flex min-h-screen justify-center bg-background px-4 py-8">
      <div className="flex h-fit w-full max-w-2xl flex-col gap-4">
        <AdminBackLink to="/admin/persons" label="К списку руководства" />
        {query.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
            <p className="text-sm text-destructive">Не удалось загрузить запись.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Повторить
            </Button>
          </div>
        ) : query.isPending ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <>
            <PersonForm mode="edit" person={query.data} />
            <PersonPhotoSection personId={query.data.id} photoUrl={query.data.photoUrl} />
          </>
        )}
      </div>
    </div>
  );
}
