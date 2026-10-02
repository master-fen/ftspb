import { createFileRoute, redirect, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Breadcrumbs, type Crumb } from "@/components/site/Breadcrumbs";
import { CategoryFilterChips } from "@/components/site/CategoryFilterChips";
import { StatusBadge } from "@/components/site/StatusBadge";
import { TOURNAMENT_SOURCES, TOURNAMENTS, type Tournament } from "@/data/tournaments";
import { eventYear, pickDefaultEventYear } from "@/lib/event-date";
import {
  filterTournaments,
  formatTournamentAge,
  formatTournamentDates,
  formatTournamentPlace,
  formatTournamentSource,
  splitIntoBlocks,
  tournamentStatus,
  type MonthGroup,
} from "@/lib/tournament-calendar";
import {
  AGE_FILTER_LABELS,
  AGE_FILTERS,
  DEFAULT_AGE_FILTER,
  DEFAULT_PLACE_FILTER,
  PLACE_FILTER_LABELS,
  PLACE_FILTERS,
} from "@/lib/tournament-filters";
import { todayInMoscow } from "@/lib/today-msk";

const TITLE = "Календарь турниров — Федерация тенниса Санкт-Петербурга";
// Строка используется дословно в реестре поиска (src/lib/search-registry.ts,
// buildDescriptionSectionEntries) — при правке см. также этот файл.
const DESCRIPTION =
  "Календарь теннисных турниров в Санкт-Петербурге и всероссийских соревнований: сроки, место проведения, возраст участников.";

const CRUMBS: Crumb[] = [{ label: "Главная", href: "/" }, { label: "Календарь турниров" }];

/**
 * `?place=` и `?age=` — по образцу `?category=` в documents.tsx: постоянное
 * умолчание вырезается stripSearchParams. `?year=` — по образцу
 * /federation/events: умолчание зависит от даты (текущий год по Москве, если
 * он есть в данных, иначе ближайший следующий, иначе последний —
 * pickDefaultEventYear), поэтому `?year=`, равный умолчанию или отсутствующий
 * в данных, loader снимает redirect-ом, а чип года по умолчанию сам ведёт на
 * адрес без параметра.
 */
const searchSchema = z.object({
  year: fallback(z.number().int().optional(), undefined),
  place: fallback(z.enum(PLACE_FILTERS), DEFAULT_PLACE_FILTER).default(DEFAULT_PLACE_FILTER),
  age: fallback(z.enum(AGE_FILTERS), DEFAULT_AGE_FILTER).default(DEFAULT_AGE_FILTER),
});

export const Route = createFileRoute("/_site/tournaments")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams({ place: DEFAULT_PLACE_FILTER, age: DEFAULT_AGE_FILTER })],
  },
  // place и age в deps — только для redirect: он сохраняет их явными
  // значениями, а не из текущего адреса роутера.
  loaderDeps: ({ search }) => ({ year: search.year, place: search.place, age: search.age }),
  loader: async ({ deps }) => {
    // «Сегодня» — в loaderData, а не в рендере: иначе около полуночи SSR и
    // гидрация разошлись бы в статусе турнира.
    const today = todayInMoscow(new Date());
    // Данные — динамическим импортом. loader, как и схема адреса, остаётся в
    // части маршрута, которая не уходит в ленивый чанк страницы: статический
    // импорт отсюда положил бы все записи календаря в общий чанк каждой
    // страницы сайта. Компонент берёт тот же модуль из своего чанка.
    const [{ TOURNAMENTS: all }, { tournamentYears }] = await Promise.all([
      import("@/data/tournaments"),
      import("@/lib/tournament-calendar"),
    ]);
    const years = tournamentYears(all);
    const defaultYear = pickDefaultEventYear(years, eventYear(today));
    if (deps.year !== undefined && (deps.year === defaultYear || !years.includes(deps.year))) {
      throw redirect({
        to: "/tournaments",
        search: { place: deps.place, age: deps.age },
        replace: true,
      });
    }
    return { today, years, defaultYear, year: deps.year ?? defaultYear };
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: TournamentsPage,
});

function TournamentsPage() {
  const { today, years, defaultYear, year } = Route.useLoaderData();
  const { place, age } = Route.useSearch();
  const navigate = useNavigate({ from: "/tournaments" });
  const yearKeys = years.map(String);
  const yearLabels: Record<string, string> = Object.fromEntries(yearKeys.map((y) => [y, y]));

  const blocks =
    year === null
      ? null
      : splitIntoBlocks(filterTournaments(TOURNAMENTS, { year, place, age }), today);
  const empty = blocks === null || (blocks.upcoming.length === 0 && blocks.finished.length === 0);

  return (
    <main className="mx-auto max-w-7xl lg:box-content px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10">
      <Breadcrumbs items={CRUMBS} />

      <div className="lg:grid lg:grid-cols-12 lg:gap-5">
        <div className="lg:col-span-8">
          <header className="mb-6 md:mb-8">
            <h1 className="ui-h1">Календарь турниров</h1>
            <p className="mt-4 font-ui text-base text-foreground">
              Турниры в Санкт-Петербурге и всероссийские соревнования: сроки, место проведения,
              возраст участников.
            </p>
            <div className="mt-3 space-y-1 font-ui">
              {TOURNAMENT_SOURCES.map((source) => (
                <p key={source.key} className="ui-caption">
                  {formatTournamentSource(source)}
                </p>
              ))}
            </div>
          </header>

          <div className="mb-8 space-y-3 md:mb-10">
            <CategoryFilterChips
              categories={PLACE_FILTERS}
              active={place}
              onSelect={(value) =>
                navigate({ search: (prev) => ({ ...prev, place: value }), resetScroll: false })
              }
              labels={PLACE_FILTER_LABELS}
              ariaLabel="Место"
              spacing="stack"
            />
            {year === null ? null : (
              <CategoryFilterChips
                categories={yearKeys}
                active={String(year)}
                onSelect={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      year: Number(value) === defaultYear ? undefined : Number(value),
                    }),
                    resetScroll: false,
                  })
                }
                labels={yearLabels}
                ariaLabel="Год"
                spacing="stack"
              />
            )}
            <CategoryFilterChips
              categories={AGE_FILTERS}
              active={age}
              onSelect={(value) =>
                navigate({ search: (prev) => ({ ...prev, age: value }), resetScroll: false })
              }
              labels={AGE_FILTER_LABELS}
              ariaLabel="Возраст"
              spacing="stack"
            />
          </div>

          {empty ? (
            <p className="rounded-xl bg-muted p-8 text-center text-muted-foreground">
              Турниров по выбранным условиям нет.
            </p>
          ) : (
            <div className="space-y-10">
              <TournamentBlock title="Предстоящие" groups={blocks.upcoming} today={today} />
              <TournamentBlock title="Завершённые" groups={blocks.finished} today={today} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** Блок с заголовком второго уровня; пустой блок не показывается. */
function TournamentBlock({
  title,
  groups,
  today,
}: {
  title: string;
  groups: MonthGroup[];
  today: string;
}) {
  if (groups.length === 0) return null;
  return (
    <section>
      <h2 className="ui-h2">{title}</h2>
      {groups.map((group) => (
        <div key={group.key} className="mt-6">
          <h3 className="ui-h3">{group.label}</h3>
          <ul className="mt-2 divide-y divide-border border-y border-border font-ui">
            {group.tournaments.map((tournament) => (
              <TournamentRow
                key={tournamentKey(tournament)}
                tournament={tournament}
                today={today}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Записи без id; сочетание полей уникально (tests/tournaments-data.test.ts). */
function tournamentKey(t: Tournament): string {
  return [t.start, t.end, t.ages.join(","), t.title, t.city, t.venue ?? ""].join("|");
}

/**
 * Строка календаря — не ссылка, подсветки при наведении нет. Завершённые
 * приглушены без метки: смысл передаёт заголовок блока.
 */
function TournamentRow({ tournament, today }: { tournament: Tournament; today: string }) {
  const status = tournamentStatus(tournament, today);
  return (
    <li className="py-3 sm:flex sm:items-baseline sm:gap-4">
      <p className="ui-caption sm:w-48 sm:shrink-0">
        {formatTournamentDates(tournament.start, tournament.end)}
      </p>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={
              status === "finished"
                ? "text-base font-medium text-muted-foreground"
                : "text-base font-medium text-foreground"
            }
          >
            {tournament.title}
          </span>
          {status === "ongoing" ? <StatusBadge>Идёт</StatusBadge> : null}
        </p>
        <p className="mt-0.5 ui-caption">
          {formatTournamentPlace(tournament)} ·{" "}
          {tournament.ages.map(formatTournamentAge).join(", ")}
        </p>
      </div>
    </li>
  );
}
