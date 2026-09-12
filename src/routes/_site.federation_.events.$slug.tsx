import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import type { Crumb } from "@/components/site/Breadcrumbs";
import { DocumentFileRow } from "@/components/site/DocumentFileRow";
import { EventPastBadge } from "@/components/site/EventPastBadge";
import { FederationSidebar } from "@/components/site/FederationSidebar";
import { SectionFrame } from "@/components/site/SectionFrame";
import { documentBadge } from "@/lib/document-badge";
import { formatEventDateLong, isPast } from "@/lib/event-date";
import {
  getPublishedDocumentsForEvent,
  getPublishedEventBySlug,
  listPublishedNewsForEvent,
} from "@/lib/events-server-fn";
import { formatIsoDateRu } from "@/lib/format-iso-date";
import { splitParagraphs, toMetaDescription } from "@/lib/plain-text";
import { OG_IMAGE_URL, SITE_NAME, SITE_URL } from "@/lib/site";
import { todayInMoscow } from "@/lib/today-msk";

const SECTION_CRUMBS: Crumb[] = [
  { label: "Главная", href: "/" },
  { label: "Федерация", href: "/federation" },
  { label: "События", href: "/federation/events" },
];

const ASIDE = <FederationSidebar activeHref="/federation/events" />;

/**
 * Имя файла с хвостовым `federation_` — маршрут не вкладывается ни в
 * раскладку раздела (src/routes/_site.federation.tsx), ни в список
 * (_site.federation.events.tsx): у страницы свои крошки в четыре уровня. Рама та
 * же — SectionFrame, справа навигация раздела с подсвеченным пунктом «События».
 */
export const Route = createFileRoute("/_site/federation_/events/$slug")({
  loader: async ({ params }) => {
    const event = await getPublishedEventBySlug({ data: params.slug });
    if (!event) throw notFound();
    const [documents, news] = await Promise.all([
      getPublishedDocumentsForEvent({ data: event.id }),
      listPublishedNewsForEvent({ data: event.id }),
    ]);
    // «Сегодня» — в loaderData, а не в рендере: иначе около полуночи SSR и
    // гидрация разошлись бы в метке «Состоялось».
    return { event, documents, news, today: todayInMoscow(new Date()) };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: `Событие не найдено — ${SITE_NAME}` },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { event } = loaderData;
    const dateLabel = formatEventDateLong(event.startsOn, event.datePrecision);
    // Дата в заголовке: у Федерации несколько «Заседаний Правления» в год,
    // заголовки без даты совпадали бы.
    const title = `${event.title}, ${dateLabel}`;
    const desc = event.description
      ? toMetaDescription(event.description)
      : toMetaDescription(
          [event.title, dateLabel, event.location].filter(Boolean).join(". ") + ".",
        );
    const url = `${SITE_URL}/federation/events/${event.slug}`;
    return {
      meta: [
        { title: `${title} — ${SITE_NAME}` },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: OG_IMAGE_URL },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: OG_IMAGE_URL },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  notFoundComponent: EventNotFound,
  errorComponent: EventError,
  component: EventPage,
});

function EventPage() {
  const { event, documents, news, today } = Route.useLoaderData();
  const past = isPast(event.startsOn, event.datePrecision, today);
  // Описание — обычный текст без HTML: абзацы по пустой строке, одиночные
  // переводы строк внутри абзаца показывает whitespace-pre-line.
  const paragraphs = event.description ? splitParagraphs(event.description) : [];

  return (
    <SectionFrame crumbs={[...SECTION_CRUMBS, { label: event.title }]} aside={ASIDE}>
      <article>
        <h1 className="ui-h1">{event.title}</h1>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-ui text-base leading-[1.6] text-foreground/80">
          <span>{formatEventDateLong(event.startsOn, event.datePrecision, event.startsTime)}</span>
          {past ? <EventPastBadge /> : null}
        </p>
        {event.location ? (
          <p className="mt-1 font-ui text-base leading-[1.6] text-foreground/80">
            {event.location}
          </p>
        ) : null}

        {paragraphs.length > 0 ? (
          <div className="mt-6 space-y-4 font-ui text-base leading-[1.6] text-foreground">
            {paragraphs.map((paragraph, i) => (
              <p key={i} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        ) : null}

        {documents.length > 0 ? (
          <section className="mt-10" aria-labelledby="event-documents-title">
            <h2 id="event-documents-title" className="ui-h2">
              Документы
            </h2>
            <div className="mt-4 space-y-2">
              {documents.map((doc) => (
                <DocumentFileRow
                  key={doc.id}
                  badge={documentBadge(doc.mimeType, doc.fileName)}
                  action={doc.title}
                  meta={formatIsoDateRu(doc.documentDate)}
                  href={doc.url}
                  external
                  sizeBytes={doc.sizeBytes}
                />
              ))}
            </div>
          </section>
        ) : null}

        {news.length > 0 ? (
          <section className="mt-10" aria-labelledby="event-news-title">
            <h2 id="event-news-title" className="ui-h2">
              Новости о событии
            </h2>
            <ul className="mt-4 space-y-3">
              {news.map((item) => (
                <li key={item.slug}>
                  <Link
                    to="/news/$newsId"
                    params={{ newsId: item.slug }}
                    className="font-ui text-base font-medium text-foreground ui-link"
                  >
                    {item.title}
                  </Link>
                  <span className="block font-ui ui-caption">
                    {formatIsoDateRu(item.publishedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </SectionFrame>
  );
}

function EventNotFound() {
  return (
    <SectionFrame crumbs={SECTION_CRUMBS} aside={ASIDE}>
      <article>
        <h1 className="ui-h1">Событие не найдено</h1>
        <p className="mt-5 font-ui text-base leading-[1.6] text-foreground">
          Возможно, событие было перемещено или удалено.{" "}
          <Link
            to="/federation/events"
            className="text-brand-navy underline underline-offset-4 ui-link"
          >
            Все события
          </Link>
        </p>
      </article>
    </SectionFrame>
  );
}

function EventError({ reset }: { reset: () => void }) {
  return (
    <SectionFrame crumbs={SECTION_CRUMBS} aside={ASIDE}>
      <article>
        <h1 className="ui-h1">Не удалось загрузить событие</h1>
        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-5 py-2.5 text-sm font-semibold text-brand-navy-foreground transition-colors hover:bg-brand-orange"
        >
          Попробовать ещё раз
        </button>
      </article>
    </SectionFrame>
  );
}
