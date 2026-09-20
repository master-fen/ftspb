/**
 * Метка ссылки на другую архивную запись.
 *
 * Разбор архива (`scripts/parse-archive.ts`) не знает адресов будущих
 * новостей: адрес строит мигратор из заголовка, разрешая совпадения. Поэтому
 * ссылка из тела одной архивной записи на страницу, ставшую другой архивной
 * записью, попадает в экспорт меткой
 * `<a href="archive-record:ИСТОЧНИК">видимый текст</a>`, где ИСТОЧНИК — поле
 * `Источник` целевой записи, а мигратор (`scripts/migrate-archive.ts`) перед
 * вставкой заменяет метку на `/news/СЛАГ`.
 *
 * Метка, для которой записи нет (запись исключена или не попала в заливку),
 * превращается в обычный текст: тег снимается, видимый текст остаётся.
 *
 * Схема выбрана несуществующей намеренно: `src/server/sanitize.ts` допускает
 * только http/https/mailto, поэтому дожившая до сайта метка ссылкой не
 * станет. Полагаться на это нельзя — `sanitize-html` удаляет атрибут, а не
 * тег, и в разметке остаётся мёртвый якорь. Гарантия — контроль парсера
 * («каждая метка разрешается в существующий ключ») и проверка остатка в
 * миграторе после замены.
 *
 * Модуль делят два скрипта с разными запускающими: `parse-archive.ts` идёт
 * под `node` (импорт строго с расширением `.ts`), `migrate-archive.ts` — под
 * `bun`. Поэтому здесь нет ни одной зависимости, кроме языка.
 */

export const RECORD_MARKER_SCHEME = "archive-record:";

/** Значение href метки на запись с данным полем `Источник`. */
export function markerHref(source: string): string {
  return RECORD_MARKER_SCHEME + source;
}

/**
 * `<a>` с меткой: href целиком в двойных кавычках — так его пишет парсер.
 * Литерал, а не сборка из `RECORD_MARKER_SCHEME`: шаблонная строка съедала бы
 * управляющие последовательности регэкспа. Совпадение литерала со схемой
 * сторожит проверка ниже.
 */
const MARKER_ANCHOR_RE = /<a\s[^>]*href="archive-record:([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

if (!MARKER_ANCHOR_RE.source.includes(RECORD_MARKER_SCHEME)) {
  throw new Error("archive-markers: литерал MARKER_ANCHOR_RE разошёлся с RECORD_MARKER_SCHEME");
}

/** Источники всех меток тела, в порядке появления (с повторами). */
export function findMarkerSources(html: string): string[] {
  return [...html.matchAll(MARKER_ANCHOR_RE)].map((m) => m[1]);
}

/**
 * Остаток схемы метки в готовом теле. После замены его быть не должно ни в
 * одном теле: остался — значит форма метки разошлась с формой замены.
 */
export function hasMarkerResidue(html: string): boolean {
  return html.includes(RECORD_MARKER_SCHEME);
}

/**
 * Карта «`Источник` записи → её слаг». Строится по ПОЛНОМУ списку записей, а
 * не по срезу `--limit`: метка может указывать на запись за пределом среза, и
 * по укороченной карте она молча стала бы текстом.
 */
export function slugMapBySource(
  sources: ReadonlyArray<string | undefined>,
  slugs: ReadonlyArray<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  sources.forEach((source, i) => {
    if (source !== undefined && slugs[i] !== undefined) map.set(source, slugs[i]);
  });
  return map;
}

export type MarkerReplaceResult = {
  html: string;
  /** Сколько меток заменено на /news/СЛАГ. */
  replaced: number;
  /** Источники меток, для которых записи нет: тег снят, текст оставлен. */
  dropped: string[];
};

/**
 * Замена меток на адреса. Ключ карты — поле `Источник` целевой записи,
 * значение — её слаг.
 */
export function replaceMarkers(
  html: string,
  slugBySource: ReadonlyMap<string, string>,
): MarkerReplaceResult {
  let replaced = 0;
  const dropped: string[] = [];
  const out = html.replace(MARKER_ANCHOR_RE, (_whole, source: string, inner: string) => {
    const slug = slugBySource.get(source);
    if (slug === undefined) {
      dropped.push(source);
      return inner;
    }
    replaced += 1;
    return `<a href="/news/${slug}">${inner}</a>`;
  });
  return { html: out, replaced, dropped };
}
