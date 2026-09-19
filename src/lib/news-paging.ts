/**
 * Чистые помощники постраничной ленты — без зависимостей: модуль тянут и
 * маршруты (eager-часть), и ленивый чанк NewsPagination.
 */

/** Карточек на странице ленты. */
export const NEWS_PAGE_SIZE = 24;

/**
 * Разбор `?page=`: целое ≥ 1 (число или строка из цифр) — само число, всё
 * остальное — 1: отсутствие, «0», «-3», «abc», дробное. Парсер адреса роутера
 * отдаёт числовые строки числами (JSON.parse), строка здесь — редкость, но
 * разбирается тоже. Маршруты применяют его через `z.unknown().transform`, а
 * не через `fallback` из zod-adapter, как у `?category=`: импорт zod-adapter
 * из модуля проекта выносил пакет в общий чанк esm.js с preload на каждой
 * странице сайта (проверено сборкой 20.09.2026), прямой импорт в файле
 * маршрута плагин роутера из ленивой части выбрасывает. Значение 1
 * вычищается из адреса `stripSearchParams({ page: 1 })` в маршруте.
 */
export function parsePageParam(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+$/.test(raw)
        ? Number(raw)
        : NaN;
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

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
