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

// ───────────────────── метка на приложенный документ ─────────────────────

/**
 * Вторая схема метки (третий круг, 24.09.2026). В тексте новости легаси стояла
 * ссылка на файл; `extractDocuments` забирал файл в «Прикреплённые файлы», а в
 * теле оставлял только видимый текст. Теперь подпись снова становится ссылкой,
 * но адрес файла на новом сайте знает не разбор, а мигратор: он строит ключ
 * хранилища `news/СЛАГ/documents/NN.ext` из слага записи и номера документа.
 * Поэтому в выгрузку идёт метка
 * `<a href="archive-document:ПУТЬ">видимый текст</a>`, где ПУТЬ — путь файла в
 * выгрузке (`download\…`, то же значение, что в поле `Документы` этой записи).
 *
 * Метка, путь которой не нашёлся среди документов своей записи, превращается в
 * обычный текст — как и метка на запись.
 */
export const DOCUMENT_MARKER_SCHEME = "archive-document:";

/** Значение href метки на документ с данным путём в выгрузке. */
export function documentMarkerHref(exportPath: string): string {
  return DOCUMENT_MARKER_SCHEME + exportPath;
}

/**
 * Литерал, а не сборка из `DOCUMENT_MARKER_SCHEME`: шаблонная строка съедала бы
 * управляющие последовательности регэкспа. Совпадение литерала со схемой
 * сторожит проверка ниже.
 */
const DOCUMENT_ANCHOR_RE = /<a\s[^>]*href="archive-document:([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

if (!DOCUMENT_ANCHOR_RE.source.includes(DOCUMENT_MARKER_SCHEME)) {
  throw new Error("archive-markers: литерал DOCUMENT_ANCHOR_RE разошёлся с DOCUMENT_MARKER_SCHEME");
}

/** Метки документов тела в порядке появления: путь файла и видимый текст. */
export function documentMarkerAnchors(html: string): Array<{ путь: string; текст: string }> {
  return [...html.matchAll(DOCUMENT_ANCHOR_RE)].map((m) => ({ путь: m[1], текст: m[2] }));
}

/** Пути всех меток документов тела, в порядке появления (с повторами). */
export function findDocumentMarkerPaths(html: string): string[] {
  return documentMarkerAnchors(html).map((a) => a.путь);
}

/** Остаток схемы метки документа в готовом теле — см. `hasMarkerResidue`. */
export function hasDocumentMarkerResidue(html: string): boolean {
  return html.includes(DOCUMENT_MARKER_SCHEME);
}

/**
 * Расширение пути в нижнем регистре, с точкой; пустая строка, если его нет.
 * Своё, а не `path.extname`: модуль делят `node` и `bun` и он обходится без
 * единой зависимости, кроме языка. Поведение то же, включая файл вида `.pdf`
 * (точка в начале расширением не считается).
 */
function extensionOf(filePath: string): string {
  const name = filePath.slice(Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/**
 * Имя файла документа в хранилище: `NN.ext`, где NN — двузначный номер с
 * единицы по порядку в поле `Документы` записи. Одно правило на мигратор
 * (ключ `news/СЛАГ/documents/NN.ext`) и на карту замены меток: второй копии у
 * него быть не должно.
 */
export function documentFileName(exportPath: string, index: number): string {
  return String(index + 1).padStart(2, "0") + extensionOf(exportPath);
}

/**
 * Карта «путь документа в выгрузке → адрес файла» для одной записи. Строится
 * по её собственному полю `Документы`, поэтому метка физически не может
 * указать на документ чужой записи.
 */
export function documentHrefsByPath(
  documents: ReadonlyArray<string>,
  href: (fileName: string) => string,
): Map<string, string> {
  const map = new Map<string, string>();
  documents.forEach((item, i) => {
    if (!map.has(item)) map.set(item, href(documentFileName(item, i)));
  });
  return map;
}

/**
 * Замена меток документов на постоянные адреса файлов. Ключ карты — путь
 * документа в выгрузке, значение — адрес файла на сайте.
 */
export function replaceDocumentMarkers(
  html: string,
  hrefByPath: ReadonlyMap<string, string>,
): MarkerReplaceResult {
  let replaced = 0;
  const dropped: string[] = [];
  const out = html.replace(DOCUMENT_ANCHOR_RE, (_whole, path: string, inner: string) => {
    const href = hrefByPath.get(path);
    if (href === undefined) {
      dropped.push(path);
      return inner;
    }
    replaced += 1;
    return `<a href="${href}">${inner}</a>`;
  });
  return { html: out, replaced, dropped };
}
