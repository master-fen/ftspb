const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Транслитерация заголовка в URL-slug: `а-я` → латиница, остальное — `[a-z0-9]+` через дефис. */
export function slugify(title: string): string {
  const transliterated = title
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("");

  return transliterated
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Лимит длины slug на старом сайте (архив до PR B этапа 3) — установлен по
 * данным трёх «длинных» slug из mock.ts, см. docs/schema.md. Не применяется
 * к 41 записи, уже смигрированной migrate-archive.ts (их slug в БД полный,
 * без обрезки, менять задним числом не стали) — только для этапа 8 (полный
 * архив 2006–2025), чтобы новые slug совпадали со старым сайтом.
 */
export const LEGACY_SLUG_MAX_LENGTH = 60;

/** Обрезка до `maxLength` символов с удалением хвостового дефиса после среза. */
export function truncateSlug(slug: string, maxLength = LEGACY_SLUG_MAX_LENGTH): string {
  return slug.slice(0, maxLength).replace(/-+$/, "");
}
