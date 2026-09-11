import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { EventPastBadge } from "@/components/site/EventPastBadge";
import { EventYearChips } from "@/components/site/EventYearChips";
import { eventYear, formatEventDateShort, isPast, pickDefaultEventYear } from "@/lib/event-date";
import { listPublishedEventYears, listPublishedEventsByYear } from "@/lib/events-server-fn";
import { todayInMoscow } from "@/lib/today-msk";

const TITLE = "События — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Заседания Правления, общие собрания и другие события Федерации тенниса Санкт-Петербурга — даты, повестка и документы.";

/**
 * `?year=` — по образцу `?category=` в documents.tsx (validateSearch +
 * loaderDeps), но умолчание здесь зависит от данных (текущий год по Москве,
 * если в нём есть события, иначе ближайший непустой — pickDefaultEventYear),
 * а stripSearchParams умеет вычищать только постоянное значение. Поэтому:
 * - нечисловое значение → fallback undefined, как отсутствие параметра;
 * - `?year=` равный умолчанию, пустой или несуществующий год → loader
 *   делает redirect на адрес без параметра;
 * - чип года по умолчанию сам ведёт на адрес без параметра (EventYearChips).
 */
const searchSchema = z.object({
  year: fallback(z.number().int().optional(), undefined),
});

export const Route = createFileRoute("/federation/events")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => ({ year: search.year }),
  loader: async ({ deps }) => {
    // «Сегодня» — в loaderData, а не в рендере: иначе около полуночи SSR и
    // гидрация разошлись бы в метке «Состоялось».
    const today = todayInMoscow(new Date());
    const years = await listPublishedEventYears();
    const defaultYear = pickDefaultEventYear(years, eventYear(today));
    if (deps.year !== undefined && (deps.year === defaultYear || !years.includes(deps.year))) {
      throw redirect({ to: "/federation/events", search: {}, replace: true });
    }
    const year = deps.year ?? defaultYear;
    const events = year === null ? [] : await listPublishedEventsByYear({ data: year });
    return { years, year, defaultYear, events, today };
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: FederationEventsPage,
});

/**
 * Раму (шапка, крошки, боковое меню, подвал) рисует макет раздела
 * (src/routes/federation.tsx) — здесь только содержимое колонки.
 */
function FederationEventsPage() {
  const { years, defaultYear, events, today } = Route.useLoaderData();

  return (
    <article>
      <h1 className="text-3xl font-medium tracking-tight text-foreground md:text-4xl lg:text-5xl">
        События
      </h1>
      <p className="mt-5 font-ui text-base leading-[1.6] text-foreground">
        Заседания Правления, общие собрания и другие события Федерации — даты, повестка и документы.
      </p>

      {defaultYear === null ? (
        <p className="mt-8 text-muted-foreground">События пока не опубликованы</p>
      ) : (
        <div className="mt-8">
          <EventYearChips years={years} defaultYear={defaultYear} />
          <ul className="divide-y divide-foreground/10 border-y border-foreground/10">
            {events.map((event) => {
              const past = isPast(event.startsOn, event.datePrecision, today);
              return (
                <li key={event.id} className="flex items-baseline gap-4 py-3">
                  {/* Метка даты фиксированной ширины: самая длинная — «сентябрь»,
                      «1-е пол.» (8 знаков) — в 6rem помещается с запасом. */}
                  <span
                    className={`w-24 shrink-0 font-ui text-sm font-semibold ${
                      past ? "text-foreground/50" : "text-brand-navy"
                    }`}
                  >
                    {formatEventDateShort(event.startsOn, event.datePrecision)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link
                      to="/federation/events/$slug"
                      params={{ slug: event.slug }}
                      className={`font-ui text-base font-medium transition-colors hover:text-brand-orange ${
                        past ? "text-foreground/50" : "text-foreground"
                      }`}
                    >
                      {event.title}
                    </Link>
                    {past ? <EventPastBadge /> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}
