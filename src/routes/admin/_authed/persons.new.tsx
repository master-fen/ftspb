import { createFileRoute } from "@tanstack/react-router";
import { AdminBackLink } from "./-components/AdminBackLink";
import { PersonForm } from "./-components/PersonForm";

export const Route = createFileRoute("/admin/_authed/persons/new")({
  component: AdminPersonNew,
});

function AdminPersonNew() {
  return (
    <div className="flex min-h-screen justify-center bg-background px-4 py-8">
      <div className="flex h-fit w-full max-w-2xl flex-col gap-4">
        <AdminBackLink to="/admin/persons" label="К списку руководства" />
        <PersonForm mode="create" />
      </div>
    </div>
  );
}
