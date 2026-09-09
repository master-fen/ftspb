import { createFileRoute } from "@tanstack/react-router";
import { Breadcrumbs, type Crumb } from "@/components/site/Breadcrumbs";
import { CharterText } from "@/components/site/CharterText";
import { CharterToc } from "@/components/site/CharterToc";
import { DocumentFileRow } from "@/components/site/DocumentFileRow";
import { FederationSidebar } from "@/components/site/FederationSidebar";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { charterContent } from "@/lib/charter/content";
import { CHARTER_DOCUMENT_SLUG, CHARTER_META } from "@/lib/charter/meta";
import { getPublishedDocumentBySlug } from "@/lib/documents-server-fn";
import { formatIsoDateRu } from "@/lib/format-iso-date";

const TITLE = "Устав. Полный текст — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Полный текст Устава Санкт-Петербургской Региональной общественной организации «Спортивная Федерация тенниса» в редакции от 17 марта 2016 года.";

const CRUMBS: Crumb[] = [
  { label: "Главная", href: "/" },
  { label: "Федерация", href: "/federation" },
  { label: "Устав", href: "/federation/charter" },
  { label: "Полный текст" },
];

/**
 * Имя файла с хвостовым `federation_` — маршрут не вкладывается в раскладку
 * раздела (src/routes/federation.tsx): у страницы свои крошки в четыре уровня.
 * Сама раскладка повторяет federation.tsx — статья слева, справа навигация
 * раздела (`activeHref="/federation/charter"`, страница вложена под пункт
 * «Устав» по адресу) и карточка оглавления.
 */
export const Route = createFileRoute("/federation_/charter/text")({
  loader: () => getPublishedDocumentBySlug({ data: CHARTER_DOCUMENT_SLUG }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: CharterTextPage,
});

function CharterTextPage() {
  const documentFile = Route.useLoaderData();

  const pdfRow = documentFile ? (
    <DocumentFileRow
      badge="PDF"
      action="Открыть PDF"
      meta={`Устав · ${formatIsoDateRu(documentFile.documentDate)}`}
      href={documentFile.url}
      external
      sizeBytes={documentFile.sizeBytes}
    />
  ) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10">
        <Breadcrumbs items={CRUMBS} />

        <div className="flex flex-col gap-10 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
          {/* На узких экранах оглавление сворачивается над текстом. */}
          <details className="rounded-md bg-muted px-4 py-3 lg:hidden">
            <summary className="cursor-pointer font-sans text-lg font-medium text-foreground">
              Содержание
            </summary>
            <CharterToc className="mt-3" />
            {pdfRow ? <div className="mt-4">{pdfRow}</div> : null}
          </details>

          {/* Юридический текст: 16px, межстрочный интервал не меньше 1.55,
              text-foreground без прозрачности — ради контраста. */}
          <article className="min-w-0 font-ui text-base leading-[1.6] text-foreground lg:order-1 lg:col-span-2">
            <h1 className="font-sans text-3xl font-medium tracking-tight text-foreground md:text-4xl lg:text-5xl">
              Устав
            </h1>
            <p className="mt-3 text-foreground/80">
              Редакция от{" "}
              <time dateTime={CHARTER_META.editionDate}>{CHARTER_META.editionDateText}</time>
            </p>
            <p className="mt-6 text-foreground/80">
              Текст приводится для ознакомления. При расхождениях приоритет имеет документ в формате
              PDF.
            </p>

            <CharterText content={charterContent} />
          </article>

          {/* Правая колонка как в federation.tsx: навигация раздела, под ней
              карточка оглавления (на широких экранах; на узких — <details> выше). */}
          <aside className="w-full lg:order-2 lg:col-span-1">
            <FederationSidebar activeHref="/federation/charter" />
            <section
              className="mt-5 hidden rounded-[30px] border border-brand-blue/10 bg-background px-0 py-6 md:py-8 lg:block"
              aria-labelledby="charter-toc-title"
            >
              <h2
                id="charter-toc-title"
                className="px-6 text-xl font-medium text-foreground md:text-2xl"
              >
                Содержание
              </h2>
              <CharterToc className="mt-3 px-6" />
              {pdfRow ? <div className="mt-6 px-6">{pdfRow}</div> : null}
            </section>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
