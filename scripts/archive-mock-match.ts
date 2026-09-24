/**
 * Сопоставление записи выгрузки с `src/data/mock.ts`: раздел и отметка
 * «главная новость». Вынесено из scripts/migrate-archive.ts отдельным
 * модулем — вместе с единственным местом, где мигратор вообще читает моки.
 *
 * Режимы `--add-only` и `--replace-all` сопоставление не зовут: на непустом
 * боевом сайте моки перебили бы выбранные человеком «главные новости».
 */
import { allNews, featuredNews } from "../src/data/mock";
import { normalizeTitle } from "./archive-migration-rules";

export type Section = "federation" | "referees" | null;

type MockNewsItem = (typeof allNews)[number];

export type MockMatch = {
  section: Section;
  featured: boolean;
  featuredOrder: number | null;
};

function mockDateToIso(date: string): string {
  const [d, m, y] = date.split(".");
  return `20${y}-${m}-${d}`;
}

function mapCategoryToSection(category: MockNewsItem["category"]): Section {
  switch (category) {
    case "Федерация":
      return "federation";
    case "Коллегия судей":
      return "referees";
    case "Общее":
      return null;
    default: {
      const exhaustive: never = category;
      throw new Error(`Неизвестная категория mock.ts: ${String(exhaustive)}`);
    }
  }
}

const byNormalizedTitle = new Map<string, MockNewsItem[]>();
for (const item of allNews) {
  const key = normalizeTitle(item.title);
  const arr = byNormalizedTitle.get(key) ?? [];
  arr.push(item);
  byNormalizedTitle.set(key, arr);
}

const featuredOrderById = new Map(featuredNews.map((item, index) => [item.id, index]));

export function matchMock(title: string, isoDate: string): MockMatch | null {
  const candidates = byNormalizedTitle.get(normalizeTitle(title));
  if (!candidates || candidates.length === 0) {
    return null;
  }

  let matched: MockNewsItem;
  if (candidates.length === 1) {
    matched = candidates[0];
  } else {
    const sameDate = candidates.filter((c) => mockDateToIso(c.date) === isoDate);
    if (sameDate.length !== 1) {
      return null;
    }
    matched = sameDate[0];
  }

  const order = featuredOrderById.get(matched.id);
  return {
    section: mapCategoryToSection(matched.category),
    featured: order !== undefined,
    featuredOrder: order ?? null,
  };
}
