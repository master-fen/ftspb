/**
 * Раздел сайта как значение фильтра — общий для новостей (`/news`) и
 * документов (`/documents`): `all` — без фильтра, `general` — записи без
 * раздела (`section is null`), остальное — значения `section_enum`
 * (src/db/schema.ts). Единственный источник допустимых значений `?category=`
 * и подписей чипов на обеих страницах.
 */
export const SECTION_CATEGORIES = ["all", "general", "federation", "referees"] as const;

export type SectionCategory = (typeof SECTION_CATEGORIES)[number];

export const DEFAULT_SECTION_CATEGORY: SectionCategory = "all";

export const SECTION_CATEGORY_LABELS: Record<SectionCategory, string> = {
  all: "Все",
  general: "Общее",
  federation: "Федерация",
  referees: "Коллегия судей",
};
