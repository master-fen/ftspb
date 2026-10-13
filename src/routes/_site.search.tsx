import type { ReactNode } from "react";
import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { Breadcrumbs, type Crumb } from "@/components/site/Breadcrumbs";
import { NewsPagination } from "@/components/site/NewsPagination";
import { SearchDocumentRow } from "@/components/site/SearchDocumentRow";
import { SearchEventRow } from "@/components/site/SearchEventRow";
import { SearchNewsRow } from "@/components/site/SearchNewsRow";
import { SearchSectionRow } from "@/components/site/SearchSectionRow";
import { SearchSortChips } from "@/components/site/SearchSortChips";
import { SearchTabs } from "@/components/site/SearchTabs";
import { SearchYearSelect } from "@/components/site/SearchYearSelect";
import { parsePageParam } from "@/lib/news-paging";
import {
  parseSearchQParam,
  parseSearchSortParam,
  parseSearchTabParam,
  parseSearchYearParam,
  type SearchTab,
} from "@/lib/search-params";
import { emptySearchResponse } from "@/lib/search-response";
import { runSearch } from "@/lib/search-server-fn";
import { useSearchPending } from "@/lib/use-search-pending";

const SEARCH_DEFAULTS = {
  q: "",
  tab: "all" as SearchTab,
  year: "all" as const,
  sort: "relevance" as const,
  page: 1,
};

/**
 * Мусор → умолчание, умолчание вычищается из адреса — тот же приём, что у
 * `?page=` в `/news` (`z.unknown().transform`, не `fallback` из
 * `@tanstack/zod-adapter`: импорт пакета из модуля проекта уводит его в
 * общий чанк с preload на каждой странице сайта, docs/decisions.md,
 * «Сборка клиента»). Парсеры — `src/lib/search-params.ts`, клиент-безопасный
 * модуль без стеммера.
 */
const searchSchema = z.object({
  q: z.unknown().transform(parseSearchQParam),
  tab: z.unknown().transform(parseSearchTabParam),
  year: z.unknown().transform(parseSearchYearParam),
  sort: z.unknown().transform(parseSearchSortParam),
  page: z.unknown().transform(parsePageParam),
});

const CRUMBS: Crumb[] = [{ label: "Главная", href: "/" }, { label: "Поиск" }];

/** Контейнер страницы — у выдачи, «уточните запрос» и заглушки загрузки один. */
const PAGE_MAIN =
  "mx-auto max-w-7xl lg:box-content px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10";

export const Route = createFileRoute("/_site/search")({
  validateSearch: searchSchema,
  search: {
    middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
  },
  loaderDeps: ({ search }) => search,
  // Пустой запрос (мобильная лупа ведёт на /search без q) — ответ без запроса к
  // серверу: тот же, что дал бы runSearch (tests/search-run.test.ts).
  loader: ({ deps }) =>
    deps.q.trim() === "" ? emptySearchResponse(deps.q, deps, true) : runSearch({ data: deps }),
  head: ({ loaderData }) => {
    const title = loaderData?.query
      ? `Поиск: «${loaderData.query}» — Федерация тенниса Санкт-Петербурга`
      : "Поиск — Федерация тенниса Санкт-Петербурга";
    return {
      meta: [{ title }, { name: "robots", content: "noindex, follow" }],
    };
  },
  component: SearchPage,
  // Заглушка загрузки (docs/decisions.md, «Публичный поиск»): без неё роутер
  // держит прежнюю страницу, пока loader не ответит, — на холодном индексе
  // секунды «ничего не происходит». 200 мс — тёплый ответ (десятки мс) успевает
  // без мелькания, 0–200 мс закрывает спиннер кнопки поиска; 300 мс — не
  // меньше, чем длится въезд страницы (PageTransition, 260 мс).
  pendingComponent: SearchPagePending,
  pendingMs: 200,
  pendingMinMs: 300,
});

function TeaserSection({
  title,
  tab,
  total,
  children,
}: {
  title: string;
  tab: SearchTab;
  total: number;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="ui-h2">{title}</h2>
        <Link
          to="/search"
          search={(current) => ({ ...current, tab, page: 1 })}
          className="ui-link text-sm"
        >
          все {total}
        </Link>
      </div>
      <ul>{children}</ul>
    </section>
  );
}

function SearchPage() {
  const result = Route.useLoaderData();
  const search = Route.useSearch();
  const noQuery = search.q.trim() === "";

  // «Уточните запрос» — только когда запрос ЕСТЬ, но не значим (одни
  // служебные слова, короче 2 знаков). Пустой запрос — другое состояние
  // («Без запроса» ниже), хотя parseSearchQuery("") тоже даёт tooVague:true
  // (ноль значимых терминов) — порядок проверок здесь обязателен.
  if (result.tooVague && !noQuery) {
    return (
      <main className={PAGE_MAIN}>
        <Breadcrumbs items={CRUMBS} />
        <header className="mb-4">
          <h1 className="ui-h1">Поиск по сайту</h1>
        </header>
        <SearchForm query={search.q} />
        <p className="mt-6 rounded-xl bg-muted p-8 text-center text-muted-foreground">
          Уточните запрос — попробуйте другое или более общее слово.
        </p>
      </main>
    );
  }

  const nothingFound =
    !noQuery &&
    result.counts.news === 0 &&
    result.counts.documents === 0 &&
    result.counts.events === 0 &&
    result.counts.sections === 0;

  return (
    <main className={PAGE_MAIN}>
      <Breadcrumbs items={CRUMBS} />
      <header className="mb-4">
        <h1 className="ui-h1">Поиск по сайту</h1>
      </header>
      <SearchForm query={search.q} />

      {noQuery ? (
        <p className="mt-6 text-muted-foreground">
          Введите запрос, чтобы найти новости, документы, события и страницы разделов.{" "}
          <Link to="/news" className="ui-link">
            Новости
          </Link>{" "}
          ·{" "}
          <Link to="/documents" className="ui-link">
            Документы
          </Link>
        </p>
      ) : nothingFound ? (
        <div className="mt-6">
          <p className="text-muted-foreground">По запросу «{result.query}» ничего не нашлось.</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
            <li>проверьте написание;</li>
            <li>попробуйте другое слово;</li>
            <li>попробуйте более общее слово.</li>
          </ul>
          <p className="mt-3">
            <Link to="/news" className="ui-link">
              Новости
            </Link>{" "}
            ·{" "}
            <Link to="/documents" className="ui-link">
              Документы
            </Link>
          </p>
        </div>
      ) : (
        <>
          <SearchTabs active={result.tab} counts={result.counts} />

          {result.partialMatch ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Точных совпадений нет — показаны результаты, где есть часть слов.
            </p>
          ) : null}

          {result.sectionsTeaser && result.sectionsTeaser.length > 0 ? (
            <TeaserSection title="Разделы сайта" tab="sections" total={result.counts.sections}>
              {result.sectionsTeaser.map((row) => (
                <SearchSectionRow key={row.id} row={row} />
              ))}
            </TeaserSection>
          ) : null}

          {result.documentsTeaser && result.documentsTeaser.length > 0 ? (
            <TeaserSection title="Документы" tab="documents" total={result.counts.documents}>
              {result.documentsTeaser.map((row) => (
                <SearchDocumentRow key={row.id} row={row} />
              ))}
            </TeaserSection>
          ) : null}

          {result.eventsTeaser && result.eventsTeaser.length > 0 ? (
            <TeaserSection title="События" tab="events" total={result.counts.events}>
              {result.eventsTeaser.map((row) => (
                <SearchEventRow key={row.id} row={row} />
              ))}
            </TeaserSection>
          ) : null}

          {result.news !== null ? (
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <SearchSortChips active={result.sort} />
                <SearchYearSelect years={result.years} active={result.year} />
              </div>
              <p className="mb-3 ui-caption">Найдено {result.totalForTab}</p>
              {result.news.length > 0 ? (
                <ul>
                  {result.news.map((row) => (
                    <SearchNewsRow key={row.id} row={row} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-muted p-8 text-center text-muted-foreground">
                  По запросу «{result.query}» новостей не нашлось.
                </p>
              )}
              <NewsPagination page={result.page} pageCount={result.pageCount} />
            </section>
          ) : null}

          {result.documents !== null ? (
            <section>
              <p className="mb-3 ui-caption">Найдено {result.totalForTab}</p>
              <ul>
                {result.documents.map((row) => (
                  <SearchDocumentRow key={row.id} row={row} />
                ))}
              </ul>
              <NewsPagination page={result.page} pageCount={result.pageCount} />
            </section>
          ) : null}

          {result.events !== null ? (
            <section>
              <p className="mb-3 ui-caption">Найдено {result.totalForTab}</p>
              <ul>
                {result.events.map((row) => (
                  <SearchEventRow key={row.id} row={row} />
                ))}
              </ul>
              <NewsPagination page={result.page} pageCount={result.pageCount} />
            </section>
          ) : null}

          {result.sections !== null ? (
            <section>
              <p className="mb-3 ui-caption">Найдено {result.totalForTab}</p>
              <ul>
                {result.sections.map((row) => (
                  <SearchSectionRow key={row.id} row={row} />
                ))}
              </ul>
              <NewsPagination page={result.page} pageCount={result.pageCount} />
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

/**
 * Форма без параметров, кроме `q`. С JS — переход роутера (заглушка загрузки и
 * спиннер «Найти», как у шапки); без JS — обычный GET на тот же адрес. Новый
 * запрос сбрасывает вкладку/год/сортировку/страницу — остальные параметры
 * формой не несутся. Фокус — только когда поле пустое (переход с мобильной
 * лупы на пустой /search): на странице с находками фокус увёл бы клавиатуру
 * поверх выдачи.
 */
function SearchForm({ query }: { query: string }) {
  const navigate = useNavigate();
  const pending = useSearchPending();
  return (
    <form
      role="search"
      method="GET"
      action="/search"
      aria-busy={pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        void navigate({ to: "/search", search: { q } });
      }}
      className="flex max-w-xl gap-2"
    >
      <label htmlFor="search-page-q" className="sr-only">
        Поиск по сайту
      </label>
      <input
        id="search-page-q"
        name="q"
        type="search"
        defaultValue={query}
        autoFocus={query.trim() === ""}
        placeholder="Что вы ищете?"
        className="h-11 w-full rounded-full border-[3px] border-brand-blue bg-background px-4 font-ui text-base text-brand-navy outline-none"
      />
      <button
        type="submit"
        className="relative h-11 shrink-0 rounded-full bg-brand-blue px-5 font-ui text-sm font-semibold text-primary-foreground"
      >
        {/* Ширина кнопки не меняется: подпись невидима, спиннер поверх. */}
        <span className={pending ? "invisible" : undefined}>Найти</span>
        {pending ? (
          <LoaderCircle
            aria-hidden="true"
            className="absolute inset-0 m-auto h-4 w-4 motion-safe:animate-spin"
          />
        ) : null}
      </button>
    </form>
  );
}

/**
 * Заглушка загрузки `/search` (`pendingComponent`): настоящие крошки и
 * заголовок, вместо поля и выдачи — серые полосы токена `skeleton`. Шесть строк
 * — около экрана: короткая выдача не даёт заметного обратного скачка подвала.
 * Сортировка и год не рисуются — вкладка и наличие новостей ещё неизвестны.
 * `data-search-pending` — метка для пробы (docs/probes.md).
 */
function SearchPagePending() {
  return (
    <main className={PAGE_MAIN} aria-busy="true" data-search-pending="">
      <Breadcrumbs items={CRUMBS} />
      <header className="mb-4">
        <h1 className="ui-h1">Поиск по сайту</h1>
      </header>
      <p role="status" className="sr-only">
        Идёт поиск…
      </p>
      <div aria-hidden="true">
        <div className="h-11 max-w-xl rounded-full bg-skeleton motion-safe:animate-pulse" />
        <div className="mt-6 mb-6 flex flex-wrap gap-2">
          <div className="h-9 w-20 rounded-full bg-skeleton motion-safe:animate-pulse" />
          <div className="h-9 w-28 rounded-full bg-skeleton motion-safe:animate-pulse" />
          <div className="h-9 w-32 rounded-full bg-skeleton motion-safe:animate-pulse" />
          <div className="h-9 w-24 rounded-full bg-skeleton motion-safe:animate-pulse" />
          <div className="h-9 w-28 rounded-full bg-skeleton motion-safe:animate-pulse" />
        </div>
        <div className="mb-3 h-4 w-28 rounded-md bg-skeleton motion-safe:animate-pulse" />
        <ul>
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <li key={row} className="border-b border-border py-4 last:border-b-0">
              <div className="h-4 w-32 rounded-md bg-skeleton motion-safe:animate-pulse" />
              <div className="mt-2 h-5 max-w-lg rounded-md bg-skeleton motion-safe:animate-pulse" />
              <div className="mt-2 h-4 rounded-md bg-skeleton motion-safe:animate-pulse" />
              <div className="mt-1 h-4 max-w-md rounded-md bg-skeleton motion-safe:animate-pulse" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
