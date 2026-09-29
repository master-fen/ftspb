/**
 * Разбор `?q=&tab=&year=&sort=&page=` страницы `/search`. Клиент-безопасный
 * модуль: импортируется прямо из файла маршрута (`z.unknown().transform`
 * вместо `fallback` из `@tanstack/zod-adapter` — тот же приём, что у
 * `?page=` в `src/lib/news-paging.ts`, иначе пакет уезжает в общий чанк
 * `esm.js` с preload на каждой странице сайта, см. docs/decisions.md,
 * «Сборка клиента»). Поэтому здесь нет ни одного импорта, тянущего стеммер
 * (`snowball-stemmers`, 868 КБ) — тот живёт в `src/lib/search-query.ts`,
 * который импортируется только из `src/server/**` и `tests/**`.
 */
import { MIN_ARCHIVE_YEAR } from "@/lib/admin-list-paging";

export const SEARCH_QUERY_MAX_LENGTH = 100;

export function parseSearchQParam(raw: unknown): string {
  return typeof raw === "string" ? raw.slice(0, SEARCH_QUERY_MAX_LENGTH) : "";
}

export const SEARCH_TABS = ["all", "news", "documents", "events", "sections"] as const;
export type SearchTab = (typeof SEARCH_TABS)[number];

export function parseSearchTabParam(raw: unknown): SearchTab {
  return typeof raw === "string" && (SEARCH_TABS as readonly string[]).includes(raw)
    ? (raw as SearchTab)
    : "all";
}

export const SEARCH_SORTS = ["relevance", "date"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export function parseSearchSortParam(raw: unknown): SearchSort {
  return typeof raw === "string" && (SEARCH_SORTS as readonly string[]).includes(raw)
    ? (raw as SearchSort)
    : "relevance";
}

function parseIntStrict(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && /^-?\d+$/.test(raw)) return Number(raw);
  return NaN;
}

/** Та же граница, что у фильтра года в админке (`MIN_ARCHIVE_YEAR`..текущий+1). */
export function parseSearchYearParam(raw: unknown): number | "all" {
  const n = parseIntStrict(raw);
  const maxYear = new Date().getFullYear() + 1;
  return Number.isInteger(n) && n >= MIN_ARCHIVE_YEAR && n <= maxYear ? n : "all";
}
