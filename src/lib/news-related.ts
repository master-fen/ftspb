import { sortNewsByDateDesc } from "@/lib/news-date";
import type { NewsItem } from "@/lib/types/news";

/**
 * Подбор «Читайте также» для страницы новости.
 *
 * Кандидаты — все `all`, кроме самой `current`. Сначала новости того же
 * раздела (`section ?? null` совпадает), новые сверху; если их меньше `limit`,
 * список добивается новостями остальных разделов, тоже новыми сверху.
 * Это склейка двух отсортированных списков, а не общая сортировка:
 * объединённый массив повторно НЕ сортируется, иначе «своё» перемешается
 * с добивкой. Повторы невозможны по построению — списки не пересекаются.
 * Результат не длиннее `limit`.
 */
export function pickRelatedNews<T extends Pick<NewsItem, "id" | "section" | "date">>(
  all: readonly T[],
  current: Pick<NewsItem, "id" | "section">,
  limit = 3,
): T[] {
  const currentSection = current.section ?? null;
  const others = all.filter((n) => n.id !== current.id);

  const same = sortNewsByDateDesc(others.filter((n) => (n.section ?? null) === currentSection));
  if (same.length >= limit) return same.slice(0, limit);

  const rest = sortNewsByDateDesc(others.filter((n) => (n.section ?? null) !== currentSection));
  return [...same, ...rest].slice(0, limit);
}
