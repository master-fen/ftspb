/**
 * Разбор отображаемой даты новости `dd.mm.yy` (`NewsItem.date`) для сортировки.
 * Единственная реализация — её используют и `/news`, и `/federation/news`,
 * чтобы порядок лент совпадал.
 */
export function parseShortDate(s: string): Date {
  const [d, m, y] = s.split(".").map((x) => parseInt(x, 10));
  return new Date(2000 + y, m - 1, d);
}

/** Копия массива, новые сверху. Порядок — как на `/news`. */
export function sortNewsByDateDesc<T extends { date: string }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => parseShortDate(b.date).getTime() - parseShortDate(a.date).getTime(),
  );
}
