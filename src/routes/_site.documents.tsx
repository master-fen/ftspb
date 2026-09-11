import { createFileRoute, Link, useNavigate, stripSearchParams } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
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
      <nav
        aria-label="Хлебные крошки"
        className="mb-4 flex h-8 items-center gap-3 text-sm leading-8 font-medium text-foreground/40 md:mb-5"
      >
        <Link to="/" className="transition-colors hover:text-foreground">
          Главная
        </Link>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-foreground/15" aria-hidden="true" />
        <span aria-current="page">Документы</span>
      </nav>

      <header className="mb-6 md:mb-8">
        <h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl lg:text-6xl">
          Документы
        </h1>
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
