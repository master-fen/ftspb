import { createFileRoute } from "@tanstack/react-router";
import { AdminBackLink } from "./-components/AdminBackLink";
import { EventForm } from "./-components/EventForm";

export const Route = createFileRoute("/admin/_authed/events/new")({
  component: AdminEventNew,
});

function AdminEventNew() {
  return (
    <div className="flex min-h-screen justify-center bg-background px-4 py-8">
      <div className="flex h-fit w-full max-w-2xl flex-col gap-4">
        <AdminBackLink to="/admin/events" label="К списку событий" />
        <EventForm mode="create" />
      </div>
    </div>
  );
}
