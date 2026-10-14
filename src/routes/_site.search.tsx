import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, stripSearchParams } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { NewsPagination } from "@/components/site/NewsPagination";
import { SearchDocumentRow } from "@/components/site/SearchDocumentRow";
import { SearchEventRow } from "@/components/site/SearchEventRow";
import { SEARCH_CRUMBS, SEARCH_PAGE_MAIN } from "@/components/site/search-page-classes";
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
  // Переход внутри поиска (новый запрос из шапки, вкладка, порядок, год,
  // листание): прежняя выдача остаётся на месте и приглушается — прокрутка и
  // фокус не теряются; заглушку рисует только рама при входе с другой страницы.
  const pending = useSearchPending();

  // «Уточните запрос» — только когда запрос ЕСТЬ, но не значим (одни
  // служебные слова, короче 2 знаков). Пустой запрос — другое состояние
  // («Без запроса» ниже), хотя parseSearchQuery("") тоже даёт tooVague:true
  // (ноль значимых терминов) — порядок проверок здесь обязателен.
  if (result.tooVague && !noQuery) {
    return (
      <main className={SEARCH_PAGE_MAIN}>
        <Breadcrumbs items={SEARCH_CRUMBS} />
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
    <main className={SEARCH_PAGE_MAIN}>
      <Breadcrumbs items={SEARCH_CRUMBS} />
      <header className="mb-4">
        <h1 className="ui-h1">Поиск по сайту</h1>
      </header>
      <SearchForm query={search.q} />

      <div
        aria-busy={pending || undefined}
        className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}
      >
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
      </div>
    </main>
  );
}

/**
 * Форма без параметров, кроме `q`, — обычный GET: работает без JS, а с JS
 * ведёт себя так же (браузер сам делает переход, поле теряет фокус, экранная
 * клавиатура закрывается). Новый запрос сбрасывает вкладку/год/сортировку/
 * страницу — остальные параметры формой не несутся. Фокус — только когда поле
 * пустое (переход с мобильной лупы на пустой /search): на странице с находками
 * фокус увёл бы клавиатуру поверх выдачи. Пока браузер ждёт ответ, у «Найти»
 * спиннер (подпись прозрачна — ширина и доступное имя кнопки те же); при
 * возврате «назад» из bfcache спиннер снимается.
 */
function SearchForm({ query }: { query: string }) {
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setSubmitting(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <form
      role="search"
      method="GET"
      action="/search"
      aria-busy={submitting || undefined}
      onSubmit={() => setSubmitting(true)}
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
        <span className={submitting ? "opacity-0" : undefined}>Найти</span>
        {submitting ? (
          <LoaderCircle
            aria-hidden="true"
            className="absolute inset-0 m-auto h-4 w-4 motion-safe:animate-spin"
          />
        ) : null}
      </button>
    </form>
  );
}
