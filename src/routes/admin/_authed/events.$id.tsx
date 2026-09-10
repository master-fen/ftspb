import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAdminEvent } from "@/lib/events-server-fn";
import { AdminBackLink } from "./-components/AdminBackLink";
import { DocumentGallery } from "./-components/DocumentGallery";
import { EventForm } from "./-components/EventForm";
import { eventDocumentParent } from "./-components/document-parent";

export const Route = createFileRoute("/admin/_authed/events/$id")({
  component: AdminEventEdit,
});

function AdminEventEdit() {
  const { id } = Route.useParams();

  const query = useQuery({
    queryKey: ["admin-event", id],
    queryFn: () => getAdminEvent({ data: id }),
  });

  return (
    <div className="flex min-h-screen justify-center bg-background px-4 py-8">
      <div className="flex h-fit w-full max-w-2xl flex-col gap-4">
        <AdminBackLink to="/admin/events" label="К списку событий" />
        {query.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
            <p className="text-sm text-destructive">Не удалось загрузить событие.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Повторить
            </Button>
          </div>
        ) : query.isPending ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <>
            <EventForm mode="edit" event={query.data} />
            <section className="rounded-xl border bg-card p-5 md:p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Paperclip className="h-5 w-5" />
                Документы события
              </h2>
              {/* Та же галерея, что у новости: различие — только адаптер. */}
              <DocumentGallery
                parent={eventDocumentParent(query.data.id)}
                uploadDefaults={{
                  title: query.data.title,
                  documentDate: query.data.startsOn,
                  section: "federation",
                }}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
