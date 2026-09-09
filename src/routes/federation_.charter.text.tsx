import { createFileRoute } from "@tanstack/react-router";
import type { Crumb } from "@/components/site/Breadcrumbs";
import { CharterText } from "@/components/site/CharterText";
import { CharterToc } from "@/components/site/CharterToc";
import { DocumentFileRow } from "@/components/site/DocumentFileRow";
import { FederationSidebar } from "@/components/site/FederationSidebar";
import { SectionFrame } from "@/components/site/SectionFrame";
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
 * Рама та же — SectionFrame: статья слева, справа навигация раздела
 * (`activeHref="/federation/charter"`, страница вложена под пункт «Устав»
 * по адресу) и карточка оглавления.
 */
export const Route = createFileRoute("/federation_/charter/text")({
  loader: () => getPublishedDocumentBySlug({ data: CHARTER_DOCUMENT_SLUG }),
  // Переход по оглавлению — навигация роутера на тот же путь с другим hash;
  // запись о файле PDF за время чтения не меняется, RPC на каждый клик не нужен.
  staleTime: 5 * 60 * 1000,
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

  const aside = (
    <>
      <div className="lg:shrink-0">
        <FederationSidebar activeHref="/federation/charter" />
      </div>
      {/* Карточка оглавления на широких экранах; на узких — <details> над текстом.
          На высоком окне колонка (SectionFrame, stickyAside="tall") липкая и
          ограничена его высотой: навигация не сжимается, карточка занимает
          остаток, список прокручивается внутри. На низком колонка идёт в
          потоке и оглавление показывается целиком. Строки файла PDF здесь нет
          намеренно — она в шапке статьи: в колонке она съедала 80px, которых
          не хватало списку. */}
      <section
        className="mt-5 hidden rounded-[30px] border border-brand-blue/10 bg-background px-0 py-6 md:py-8 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
        aria-labelledby="charter-toc-title"
      >
        <h2
          id="charter-toc-title"
          className="shrink-0 px-6 text-xl font-medium text-foreground md:text-2xl"
        >
          Содержание
        </h2>
        <CharterToc className="mt-3 px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto" />
      </section>
    </>
  );

  return (
    <SectionFrame crumbs={CRUMBS} aside={aside} stickyAside="tall">
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
      <article className="font-ui text-base leading-[1.6] text-foreground">
        <h1 className="font-sans text-3xl font-medium tracking-tight text-foreground md:text-4xl lg:text-5xl">
          Устав
        </h1>
        <p className="mt-3 text-foreground/80">
          Редакция от{" "}
          <time dateTime={CHARTER_META.editionDate}>{CHARTER_META.editionDateText}</time>
        </p>
        {pdfRow ? <div className="mt-4 max-w-md">{pdfRow}</div> : null}
        <p className="mt-6 text-foreground/80">
          Текст приводится для ознакомления. При расхождениях приоритет имеет документ в формате
          PDF.
        </p>

        <CharterText content={charterContent} />
      </article>
    </SectionFrame>
  );
}
