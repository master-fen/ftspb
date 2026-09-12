import { createFileRoute, useNavigate, stripSearchParams } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Breadcrumbs, type Crumb } from "@/components/site/Breadcrumbs";
import { CategoryFilterChips } from "@/components/site/CategoryFilterChips";
import { DocumentFileRow } from "@/components/site/DocumentFileRow";
import { documentBadge } from "@/lib/document-badge";
import { listPublishedLibraryDocuments } from "@/lib/documents-server-fn";
import { formatIsoDateRu } from "@/lib/format-iso-date";
import {
  DEFAULT_SECTION_CATEGORY,
  SECTION_CATEGORIES,
  SECTION_CATEGORY_LABELS,
  type SectionCategory,
} from "@/lib/section-category";

const TITLE = "Документы — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Библиотека документов Федерации тенниса Санкт-Петербурга с фильтром по разделам.";

const DEFAULT_FILTER: SectionCategory = DEFAULT_SECTION_CATEGORY;

const CRUMBS: Crumb[] = [{ label: "Главная", href: "/" }, { label: "Документы" }];

// `?category=` — по образцу /news (news.index.tsx): та же схема, тот же fallback,
// значение по умолчанию вырезается из адреса.
const searchSchema = z.object({
  category: fallback(z.enum(SECTION_CATEGORIES), DEFAULT_FILTER).default(DEFAULT_FILTER),
});

export const Route = createFileRoute("/_site/documents")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams({ category: DEFAULT_FILTER })],
  },
  // В отличие от /news фильтр применяется в БД, поэтому loader зависит от search.
  loaderDeps: ({ search }) => ({ category: search.category }),
  loader: ({ deps }) => listPublishedLibraryDocuments({ data: deps.category }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const documents = Route.useLoaderData();
  const { category } = Route.useSearch();
  const navigate = useNavigate({ from: "/documents" });
  const active: SectionCategory = category;

  const select = (value: SectionCategory) => {
    navigate({ search: { category: value }, resetScroll: false });
  };

  return (
    <main className="mx-auto max-w-7xl px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10">
      <Breadcrumbs items={CRUMBS} />

      <header className="mb-6 md:mb-8">
        <h1 className="ui-h1">Документы</h1>
      </header>

      <CategoryFilterChips active={active} onSelect={select} labels={SECTION_CATEGORY_LABELS} />

      {documents.length === 0 ? (
        <p className="rounded-xl bg-muted p-8 text-center text-muted-foreground">
          В этом разделе документов пока нет
        </p>
      ) : (
        <div className="max-w-3xl space-y-2">
          {documents.map((doc) => {
            const date = formatIsoDateRu(doc.documentDate);
            const meta = doc.section ? `${SECTION_CATEGORY_LABELS[doc.section]} · ${date}` : date;
            return (
              <DocumentFileRow
                key={doc.id}
                badge={documentBadge(doc.mimeType, doc.fileName)}
                action={doc.title}
                meta={meta}
                href={doc.url}
                external
                sizeBytes={doc.sizeBytes}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
