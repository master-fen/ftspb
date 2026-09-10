/**
 * Обычный текст без HTML (например, `event.description`): разбивка на абзацы
 * для рендера и обрезка для `<meta name="description">`. Функции чистые.
 */

/**
 * Абзацы по пустой строке (строка из одних пробелов тоже пустая). Одиночные
 * переводы строк внутри абзаца сохраняются — их показывает
 * `whitespace-pre-line`, иначе повестка «1. …» / «2. …» слиплась бы.
 */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Текст для meta description: пробелы и переводы строк схлопываются в один
 * пробел; длиннее `max` — обрезка по последней границе слова и «…» (итог не
 * длиннее `max`). Слово длиннее всего лимита режется посередине.
 */
export function toMetaDescription(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) {
    return flat;
  }
  const head = flat.slice(0, max - 1);
  const lastSpace = head.lastIndexOf(" ");
  const cut = lastSpace > 0 ? head.slice(0, lastSpace) : head;
  return `${cut.replace(/[\s.,;:!?—–-]+$/, "")}…`;
}
