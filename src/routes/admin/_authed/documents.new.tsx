import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "./-components/DocumentForm";

export const Route = createFileRoute("/admin/_authed/documents/new")({
  component: AdminDocumentNew,
});

function AdminDocumentNew() {
  return (
    <div className="flex min-h-screen justify-center bg-background px-4 py-8">
      <div className="h-fit w-full max-w-2xl">
        <DocumentForm mode="create" />
      </div>
    </div>
  );
}
