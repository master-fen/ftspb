/**
 * Разбор `?...=` списков админки («Новости», «Документы») и клэмп страницы.
 * Каждый parse* — тотальная функция: для любого входа отдаёт валидное
 * значение (мусор → умолчание), поэтому схема поиска маршрута применяет их
 * через `z.unknown().transform(...)`, без `fallback` из `@tanstack/zod-adapter`
 * (см. src/lib/news-paging.ts, parsePageParam — тот же приём). Модуль не
 * специфичен для новостей — им пользуются оба списка, поэтому имя по
 * концепту («admin-list»), не по потребителю.
 */

import { DOCUMENT_SECTIONS, NEWS_SECTIONS } from "@/lib/section-category";

export const ADMIN_PAGE_SIZE = 50;
/** Архив старого сайта не старше начала 1990-х. */
export const MIN_ARCHIVE_YEAR = 1990;

/**
 * В отличие от `clampPage` (публичная лента `/news` → первая страница при
 * выходе за диапазон), здесь номер больше последней даёт последнюю: реестр
 * для ручного разбора архива не должен ронять редактора на первую страницу,
 * если после смены фильтра список стал короче.
 */
export function clampPageToLast(page: number, pageCount: number): number {
  if (pageCount <= 0) return 1;
  if (!Number.isInteger(page) || page < 1) return 1;
  return page > pageCount ? pageCount : page;
}

function parseIntStrict(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && /^-?\d+$/.test(raw)) return Number(raw);
  return NaN;
}

/**
 * Год `?year=`: целое в `[MIN_ARCHIVE_YEAR, текущий год + 1]`, иначе «все
 * годы». Верхняя граница — от текущей даты (не хардкод): черновик на
 * будущее не должен требовать переиздания правила.
 */
export function parseYearParam(raw: unknown): number | "all" {
  const n = parseIntStrict(raw);
  const maxYear = new Date().getFullYear() + 1;
  return Number.isInteger(n) && n >= MIN_ARCHIVE_YEAR && n <= maxYear ? n : "all";
}

// Фильтры раздела двух списков разные: `athletes` есть только у новостей.
const NEWS_SECTION_FILTER_VALUES = ["all", "none", ...NEWS_SECTIONS] as const;
const DOCUMENT_SECTION_FILTER_VALUES = ["all", "none", ...DOCUMENT_SECTIONS] as const;
export type AdminNewsSectionFilter = (typeof NEWS_SECTION_FILTER_VALUES)[number];
export type AdminDocumentSectionFilter = (typeof DOCUMENT_SECTION_FILTER_VALUES)[number];

export function parseNewsSectionParam(raw: unknown): AdminNewsSectionFilter {
  return typeof raw === "string" && (NEWS_SECTION_FILTER_VALUES as readonly string[]).includes(raw)
    ? (raw as AdminNewsSectionFilter)
    : "all";
}

export function parseDocumentSectionParam(raw: unknown): AdminDocumentSectionFilter {
  return typeof raw === "string" &&
    (DOCUMENT_SECTION_FILTER_VALUES as readonly string[]).includes(raw)
    ? (raw as AdminDocumentSectionFilter)
    : "all";
}

const STATUS_VALUES = ["all", "draft", "published"] as const;
export type AdminStatusFilter = (typeof STATUS_VALUES)[number];

export function parseStatusParam(raw: unknown): AdminStatusFilter {
  return typeof raw === "string" && (STATUS_VALUES as readonly string[]).includes(raw)
    ? (raw as AdminStatusFilter)
    : "all";
}

const SOURCE_VALUES = ["all", "archive", "manual"] as const;
export type AdminSourceFilter = (typeof SOURCE_VALUES)[number];

export function parseSourceParam(raw: unknown): AdminSourceFilter {
  return typeof raw === "string" && (SOURCE_VALUES as readonly string[]).includes(raw)
    ? (raw as AdminSourceFilter)
    : "all";
}

/** Только `true`/`"1"` включают «показывать удалённые» — всё остальное молчаливое умолчание (выключено). */
export function parseDeletedParam(raw: unknown): boolean {
  return raw === true || raw === "1";
}

/** Текстовый запрос: обрезка пробелов по краям, не-строка → пустая строка. */
export function parseTextParam(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}
