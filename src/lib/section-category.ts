import { z } from "zod";

/**
 * Разделы сайта. `section_enum` (src/db/schema.ts) общий для новостей и
 * документов, но допустимые значения у них разные: `athletes` («Наши
 * спортсмены») — только новости. Здесь — единственный источник списков,
 * подписей и схем валидации; схема БД держит свой литеральный список
 * (drizzle-kit не разрешает алиас `@/`), от расхождения защищает
 * tests/news-section-athletes.test.ts.
 */
export const NEWS_SECTIONS = ["federation", "referees", "athletes"] as const;
export const DOCUMENT_SECTIONS = ["federation", "referees"] as const;

export type NewsSection = (typeof NEWS_SECTIONS)[number];
export type DocumentSection = (typeof DOCUMENT_SECTIONS)[number];

/** Подписи разделов — и для чипов, и для строки «категория · дата», и для админки. */
export const SECTION_LABELS = {
  federation: "Федерация",
  referees: "Коллегия судей",
  athletes: "Наши спортсмены",
} as const satisfies Record<NewsSection, string>;

/**
 * Раздел как значение фильтра `?category=`: `all` — без фильтра, `general` —
 * записи без раздела (`section is null`), остальное — значения `section_enum`.
 * Порядок массивов — порядок чипов.
 */
export const NEWS_SECTION_CATEGORIES = ["all", "general", ...NEWS_SECTIONS] as const;
export const DOCUMENT_SECTION_CATEGORIES = ["all", "general", ...DOCUMENT_SECTIONS] as const;

export type NewsSectionCategory = (typeof NEWS_SECTION_CATEGORIES)[number];
export type DocumentSectionCategory = (typeof DOCUMENT_SECTION_CATEGORIES)[number];

export const DEFAULT_SECTION_CATEGORY = "all" as const;

export const SECTION_CATEGORY_LABELS: Record<NewsSectionCategory, string> = {
  all: "Все",
  general: "Общее",
  ...SECTION_LABELS,
};

export const newsSectionSchema = z.enum(NEWS_SECTIONS);
export const documentSectionSchema = z.enum(DOCUMENT_SECTIONS);

/** Пункты выбора раздела в админке новостей (форма и фильтр списка). */
export const NEWS_SECTION_OPTIONS: ReadonlyArray<{ value: NewsSection; label: string }> =
  NEWS_SECTIONS.map((value) => ({ value, label: SECTION_LABELS[value] }));
