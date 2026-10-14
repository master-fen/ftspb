import type { Crumb } from "./Breadcrumbs";

/**
 * Общее у страницы `/search` (`src/routes/_site.search.tsx`) и её заглушки
 * загрузки (`SearchPagePending`, рисует рама `_site`): контейнер и крошки — одна
 * строка классов и одни данные в двух файлах.
 */
export const SEARCH_PAGE_MAIN =
  "mx-auto max-w-7xl lg:box-content px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10";

export const SEARCH_CRUMBS: Crumb[] = [{ label: "Главная", href: "/" }, { label: "Поиск" }];
