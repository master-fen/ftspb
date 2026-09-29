/**
 * Сопоставление текстового поискового запроса — общий модуль для новостей и
 * документов админки. Регистронезависимость сделана в JS (`toLowerCase`),
 * не SQL `ILIKE`/`lower()`: те зависят от `lc_ctype` подключения к
 * Postgres, а локаль боевой базы неизвестна (см. docs/decisions.md).
 * `String.prototype.toLowerCase()` в JS — часть спецификации языка
 * (Unicode default case folding), от локали ОС/процесса не зависит.
 */
import { collapse, decodeEntities } from "@/lib/news-excerpt";

const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_RE = /<[^>]*>/g;

/**
 * Весь видимый текст HTML (не только абзацев, в отличие от `paragraphText`
 * из news-excerpt.ts — тот сделан для анонса и намеренно отбрасывает текст
 * таблиц/списков/заголовков вне `<p>`). `<script>`/`<style>` вырезаются
 * вместе с содержимым; остальные теги — вместе с атрибутами (`href` и
 * прочее) — заменяются пробелом, чтобы разметка не склеивала соседние
 * слова. Для обычного текста без тегов — просто decode+collapse.
 */
export function visibleText(html: string | null | undefined): string {
  if (!html) return "";
  const withoutScriptsStyles = html.replace(SCRIPT_STYLE_RE, " ");
  return collapse(decodeEntities(withoutScriptsStyles.replace(TAG_RE, " ")));
}

/** Пробелы по краям — не запрос; пустая строка после обрезки — нет фильтра. */
export function normalizeSearchQuery(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * toLowerCase + ё→е — легаси писал и «е», и «ё» вперемешку. Экспортируется:
 * это единственная точка нормализации, через которую проходят и админский
 * поиск (`matchesQuery` ниже), и стеммер публичного поиска (`stemWord`,
 * `src/lib/search-stem.ts`) — стеммер обязан получать уже свёрнутый ё→е
 * текст, иначе основы слов с «ё» расходятся с эталоном (`docs/decisions.md`).
 */
export function foldForSearch(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е");
}

/** `%`/`_` в запросе — обычные символы: сравнение подстрокой, не LIKE. */
export function matchesQuery(haystack: string, normalizedQuery: string): boolean {
  return foldForSearch(haystack).includes(foldForSearch(normalizedQuery));
}
