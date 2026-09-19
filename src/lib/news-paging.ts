/**
 * Чистые помощники постраничной ленты — без зависимостей: модуль тянут и
 * маршруты, и ленивый чанк NewsPagination. Поле схемы поиска `?page=` (zod)
 * живёт отдельно в `news-page-search.ts`, чтобы zod-adapter не попадал в
 * общий чанк и в preload каждой страницы.
 */

/** Карточек на странице ленты. */
export const NEWS_PAGE_SIZE = 24;

/** Число страниц; 0 при пустом списке. */
export function pageCountFor(total: number, pageSize = NEWS_PAGE_SIZE): number {
  return Math.ceil(Math.max(0, total) / pageSize);
}

/** Страница в пределах [1, pageCount]; вне диапазона (в том числе при 0 страниц) — первая. */
export function clampPage(page: number, pageCount: number): number {
  return Number.isInteger(page) && page >= 1 && page <= pageCount ? page : 1;
}

export type PaginationState = {
  prev: number | null;
  next: number | null;
  label: string;
};

/**
 * Соседние страницы и подпись «Стр. N из M» для управления. `page` — уже
 * приведённый сервером (`clampPage`), не `?page=` из адреса: при `?page=99`
 * сервер отдаёт первую страницу, и «Вперёд» ведёт на вторую, а не на сотую.
 */
export function paginationState(page: number, pageCount: number): PaginationState {
  return {
    prev: page > 1 ? page - 1 : null,
    next: page < pageCount ? page + 1 : null,
    label: `Стр. ${page} из ${pageCount}`,
  };
}
