import { createFileRoute } from "@tanstack/react-router";
import { AdminBackLink } from "./-components/AdminBackLink";
import { DocumentForm } from "./-components/DocumentForm";

export const Route = createFileRoute("/admin/_authed/documents/new")({
  component: AdminDocumentNew,
});

function AdminDocumentNew() {
  return (
    <div className="flex min-h-screen justify-center bg-background px-4 py-8">
      <div className="flex h-fit w-full max-w-2xl flex-col gap-4">
        <AdminBackLink to="/admin/documents" label="К списку документов" />
        <DocumentForm mode="create" />
      </div>
    </div>
  );
}
