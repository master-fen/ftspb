import { Breadcrumbs } from "./Breadcrumbs";
import { SEARCH_CRUMBS, SEARCH_PAGE_MAIN } from "./search-page-classes";

/**
 * Заглушка загрузки поиска: рама `_site` рисует её вместо прежней страницы,
 * пока идёт вход на `/search` с другой страницы (docs/decisions.md, «Публичный
 * поиск»). Настоящие крошки и заголовок, вместо поля и выдачи — полосы токена
 * `skeleton`. Шесть строк — около экрана: короткая выдача не даёт заметного
 * обратного скачка подвала. Сортировка и год не рисуются — вкладка и наличие
 * новостей ещё неизвестны. Отступы ряда «таблеток» — как у `SearchTabs`.
 * `data-search-pending` — метка для пробы (docs/probes.md).
 */
export function SearchPagePending() {
  return (
    <main className={SEARCH_PAGE_MAIN} aria-busy="true" data-search-pending="">
      <Breadcrumbs items={SEARCH_CRUMBS} />
      <header className="mb-4">
        <h1 className="ui-h1">Поиск по сайту</h1>
      </header>
      <p role="status" className="sr-only">
        Идёт поиск…
      </p>
      <div aria-hidden="true">
        <div className="h-11 max-w-xl rounded-full bg-skeleton motion-safe:animate-pulse" />
        <div className="mt-4 mb-6 flex flex-wrap gap-2">
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
