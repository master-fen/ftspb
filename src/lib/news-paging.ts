import { fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

/** Карточек на странице ленты. */
export const NEWS_PAGE_SIZE = 24;

/**
 * Поле `?page=` схемы поиска: целое ≥ 1, иначе 1 (мусор, «0», «-3»);
 * отсутствует — 1. Парсер адреса роутера отдаёт числовые строки числами
 * (JSON.parse), нечисловые — строками; `fallback` ловит и то и другое, как
 * `?category=` на той же странице. Значение 1 вычищается из адреса
 * `stripSearchParams({ page: 1 })` в маршруте.
 */
export const pageSearchField = fallback(z.number().int().min(1), 1).default(1);

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
