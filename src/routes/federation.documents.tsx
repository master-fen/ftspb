import { createFileRoute } from "@tanstack/react-router";
import { DocumentFileRow } from "@/components/site/DocumentFileRow";
import { documentBadge } from "@/lib/document-badge";
import { listPublishedLibraryDocuments } from "@/lib/documents-server-fn";
import { formatIsoDateRu } from "@/lib/format-iso-date";
import { SECTION_CATEGORY_LABELS } from "@/lib/section-category";

const TITLE = "Документы Федерации — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Официальные документы Федерации тенниса Санкт-Петербурга: положения, регламенты, правила и формы.";

export const Route = createFileRoute("/federation/documents")({
  loader: () => listPublishedLibraryDocuments({ data: "federation" }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: FederationDocumentsPage,
});

/**
 * Раму (шапка, крошки, боковое меню, подвал) рисует макет раздела
 * (src/routes/federation.tsx) — здесь только содержимое колонки.
 */
function FederationDocumentsPage() {
  const documents = Route.useLoaderData();

  return (
    <article>
      <h1 className="text-3xl font-medium tracking-tight text-foreground md:text-4xl lg:text-5xl">
        Документы Федерации
      </h1>
      <p className="mt-5 font-ui text-base leading-[1.6] text-foreground">
        Официальные документы, регулирующие деятельность Федерации и проведение соревнований:
        положения, регламенты, правила, формы и другие материалы.
      </p>

      {documents.length === 0 ? (
        <p className="mt-8 text-muted-foreground">Документов пока нет</p>
      ) : (
        <div className="mt-8 space-y-2">
          {documents.map((doc) => (
            <DocumentFileRow
              key={doc.id}
              badge={documentBadge(doc.mimeType, doc.fileName)}
              action={doc.title}
              meta={`${SECTION_CATEGORY_LABELS.federation} · ${formatIsoDateRu(doc.documentDate)}`}
              href={doc.url}
              external
              sizeBytes={doc.sizeBytes}
            />
          ))}
        </div>
      )}
    </article>
  );
}
