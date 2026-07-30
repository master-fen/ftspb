import type { NewsCategory } from "@/lib/types/news";

/** Категория «Общее» не несёт полезной информации — её лейбл не показываем. */
export function newsCategoryLabel(category: NewsCategory): string | null {
  return category === "Общее" ? null : category;
}

/** Строка мета-информации карточки: «Категория — дата» либо просто дата. */
export function newsMetaLine(category: NewsCategory, date: string): string {
  const label = newsCategoryLabel(category);
  return label ? `${label} — ${date}` : date;
}
