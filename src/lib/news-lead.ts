/**
 * Показывать ли серый анонс над фото на странице новости.
 *
 * У архивных новостей анонс — тизерная фраза строки ленты, а тело взято со
 * страницы, и та же фраза часто стоит в начале тела. Показанная дважды, она
 * читается как дефект.
 */

/**
 * Проба — начало анонса. Шестьдесят знаков: короче было бы случайное
 * совпадение, длиннее — не пережило бы мелкую правку текста.
 */
const PROBE_LENGTH = 60;

/**
 * Проба короче этого не считается: у совсем короткого анонса совпадение
 * начала ничего не значит.
 */
const MIN_PROBE_LENGTH = 20;

/**
 * Плоский текст для сравнения: снятие тегов, кавычки и многоточие долой,
 * пробелы в один, нижний регистр. Сущности (`&nbsp;`, `&amp;`) не
 * раскрываются — они одинаково стоят и в анонсе, и в теле.
 */
export function normalizeLeadText(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/[«»"'“”]/g, "")
    .replace(/[…]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Анонса нет или он не повторяет начало тела — показываем. */
export function shouldShowLead(excerpt?: string | null, body?: string | null): boolean {
  const excerptNorm = excerpt ? normalizeLeadText(excerpt) : "";
  if (!excerptNorm) return false;
  const probe = excerptNorm.slice(0, PROBE_LENGTH);
  if (probe.length <= MIN_PROBE_LENGTH) return true;
  const bodyNorm = body ? normalizeLeadText(body) : "";
  return !bodyNorm.startsWith(probe);
}
