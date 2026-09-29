/**
 * Строка находки (новость, событие, раздел) — кликабельна целиком приёмом
 * «растянутой ссылки»: ссылка одна, её `::after` накрывает строку (`relative`
 * на строке, ссылка не позиционируется). `-mx-3 px-3` даёт подложке наведения
 * поля, не сдвигая текст относительно страницы. Строки документов не берут
 * этот приём: в них две ссылки.
 */
export const SEARCH_ROW =
  "relative -mx-3 border-b border-border px-3 py-4 last:border-b-0 ui-link-row";
export const SEARCH_ROW_LINK = "ui-link after:absolute after:inset-0";
