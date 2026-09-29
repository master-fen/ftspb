import type { ReactNode } from "react";
import { createFileRoute, Link, stripSearchParams } from "@tanstack/react-router";
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
import { runSearch } from "@/lib/search-server-fn";

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

export const Route = createFileRoute("/_site/search")({
  validateSearch: searchSchema,
  search: {
    middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => runSearch({ data: deps }),
  head: ({ loaderData }) => {
    const title = loaderData?.query
      ? `Поиск: «${loaderData.query}» — Федерация тенниса Санкт-Петербурга`
      : "Поиск — Федерация тенниса Санкт-Петербурга";
    return {
      meta: [{ title }, { name: "robots", content: "noindex, follow" }],
    };
  },
  component: SearchPage,
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

  if (result.tooVague) {
    return (
      <main className="mx-auto max-w-7xl px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:box-content lg:px-10">
        <Breadcrumbs items={CRUMBS} />
        <header className="mb-6 md:mb-8">
          <h1 className="ui-h1">Поиск по сайту</h1>
        </header>
        <SearchForm query={search.q} />
        <p className="mt-6 rounded-xl bg-muted p-8 text-center text-muted-foreground">
          Уточните запрос — попробуйте другое или более общее слово.
        </p>
      </main>
    );
  }

  const noQuery = search.q.trim() === "";
  const nothingFound =
    !noQuery &&
    result.counts.news === 0 &&
    result.counts.documents === 0 &&
    result.counts.events === 0 &&
    result.counts.sections === 0;

  return (
    <main className="mx-auto max-w-7xl px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:box-content lg:px-10">
      <Breadcrumbs items={CRUMBS} />
      <header className="mb-6 md:mb-8">
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
 * Форма без параметров, кроме `q`, — обычный GET: работает без JS, а с JS
 * ведёт себя так же (браузер сам делает переход). Новый запрос сбрасывает
 * вкладку/год/сортировку/страницу — остальные параметры формой не несутся.
 * Фокус — только когда поле пустое (переход с мобильной лупы на пустой
 * /search): на странице с находками фокус увёл бы клавиатуру поверх выдачи.
 */
function SearchForm({ query }: { query: string }) {
  return (
    <form role="search" method="GET" action="/search" className="flex max-w-xl gap-2">
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
        className="h-11 shrink-0 rounded-full bg-brand-blue px-5 font-ui text-sm font-semibold text-primary-foreground"
      >
        Найти
      </button>
    </form>
  );
}
