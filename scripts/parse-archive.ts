/**
 * Парсер архива новостей легаси-сайта tennisfed.spb.ru (этап 8).
 *
 * Запуск:  node scripts/parse-archive.ts --archive=D:\Webarchive --out=D:\Webarchive\export
 * Самотест санитайзера:  node scripts/parse-archive.ts --self-test
 *
 * Работает на node 24 без сборки (erasable-syntax TS), только встроенные
 * модули; вся разметка архива — windows-1251, читается строго через
 * new TextDecoder("windows-1251"). bun этот скрипт не запускает (его
 * TextDecoder не знает windows-1251) — потому node, а не bun.
 *
 * Архив только читается; записываются ровно два файла в --out:
 * news_export_local.json (ключи — как в ArchiveRecord мигратора) и
 * parse-report.md. Повторный прогон даёт побайтово идентичный JSON:
 * порядок файлов ленты фиксирован, внутри файла записи идут по позиции,
 * таймстампов в выводе нет.
 *
 * Карта вёрстки (схемы A/B/C/D, аномалии, ожидаемые счёты) — из
 * рекогносцировки D:\Webarchive\recon\stage8-schemas.md; здесь она
 * закреплена константами RECON_EXPECTED_* для сверки в отчёте.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

// ───────────────────────── аргументы ─────────────────────────

function parseArgs(argv: string[]) {
  let archive: string | undefined;
  let out: string | undefined;
  let selfTest = false;
  for (const arg of argv) {
    if (arg.startsWith("--archive=")) archive = arg.slice("--archive=".length);
    else if (arg.startsWith("--out=")) out = arg.slice("--out=".length);
    else if (arg === "--self-test") selfTest = true;
    else throw new Error(`Неизвестный аргумент: ${arg}`);
  }
  if (!selfTest && (!archive || !out)) {
    throw new Error("Обязательны --archive=ПУТЬ и --out=ПУТЬ (или --self-test)");
  }
  return { archive: archive ?? "", out: out ?? "", selfTest };
}

const { archive: ARCHIVE, out: OUT_DIR, selfTest: SELF_TEST } = parseArgs(process.argv.slice(2));

const DECODER = new TextDecoder("windows-1251");
const readCp1251 = (p: string): string => DECODER.decode(readFileSync(p));

const SITE = "https://www.tennisfed.spb.ru";
const IMG_EXT_RE = /\.(?:jpe?g|png|gif)$/i;
const DOC_EXT_RE = /\.(?:pdf|docx?|xlsx?|pptx?|rtf|zip|rar|mp4|mov)$/i;

// ───────────────────────── ожидания рекогносцировки ─────────────────────────

/** items по файлам из таблицы раздела 4 stage8-schemas.md. */
const RECON_EXPECTED_ITEMS: Record<string, number> = {
  "newsarch_2004.html": 2,
  "newsarch_2005.html": 24,
  "newsarch_2006.html": 55,
  "newsarch_2007.html": 47,
  "newsarch_2008.html": 45,
  "newsarch_2009.html": 40,
  "newsarch_2010.html": 85,
  "newsarch_2011.html": 96,
  "newsarch_2012.html": 69,
  "newsarch_2013.html": 143,
  "newsarch_2014.html": 27,
  "newsarch_2014_2.html": 25,
  "newsarch_2014_3.html": 24,
  "newsarch_2014_4.html": 21,
  "newsarch_2015.html": 112,
  "newsarch_2016.html": 126,
  "newsarch_2017.html": 149,
  "newsarch_2018.html": 104,
  "newsarch_2019.html": 87,
  "newsarch_2020.html": 67,
  "newsarch_2021.html": 74,
  "newsarch_2022.html": 99,
  "newsarch_2023.html": 110,
  "newsarch_2024.html": 113,
  "newsarch_2025.html": 103,
  "news.html": 43,
};

/** Ожидаемые склейки (ряд-тело без заголовка, продолжение предыдущей новости). */
const RECON_EXPECTED_MERGES: Record<string, number> = {
  "newsarch_2004.html": 1,
  "newsarch_2006.html": 5,
};

/** Фиксированный порядок файлов ленты — он же порядок записей в JSON. */
const FEED_FILES: string[] = [
  "newsarch_2004.html",
  "newsarch_2005.html",
  "newsarch_2006.html",
  "newsarch_2007.html",
  "newsarch_2008.html",
  "newsarch_2009.html",
  "newsarch_2010.html",
  "newsarch_2011.html",
  "newsarch_2012.html",
  "newsarch_2013.html",
  "newsarch_2014.html",
  "newsarch_2014_2.html",
  "newsarch_2014_3.html",
  "newsarch_2014_4.html",
  "newsarch_2015.html",
  "newsarch_2016.html",
  "newsarch_2017.html",
  "newsarch_2018.html",
  "newsarch_2019.html",
  "newsarch_2020.html",
  "newsarch_2021.html",
  "newsarch_2022.html",
  "newsarch_2023.html",
  "newsarch_2024.html",
  "newsarch_2025.html",
  "news.html",
];

/** Год файла ленты — для отчёта «запись с чужим годом». news.html — текущая лента 2026. */
function feedYear(file: string): number {
  const m = file.match(/newsarch_(\d{4})/);
  return m ? Number(m[1]) : 2026;
}

// ───────────────────────── выходной формат ─────────────────────────

/** Ключи — как в ArchiveRecord мигратора (+ ТекстHTML, добавляемый этим этапом). */
type OutputRecord = {
  Заголовок: string;
  Дата: string;
  ДатаИсходная?: string;
  Анонс?: string;
  ТекстHTML: string;
  Обложка?: string;
  Галерея?: string[];
  Документы?: string[];
  Источник: string;
};

// ───────────────────────── отчёт ─────────────────────────

type ReportBag = {
  perFile: Array<{
    file: string;
    rows: number;
    titleRows: number;
    bodyRows: number;
    emptyRows: number;
    commentedBodies: number;
    merges: number;
    records: number;
  }>;
  merges: string[];
  dateFixes: string[];
  foreignYear: string[];
  lostArticles: string[];
  unresolved: string[];
  collisions: string[];
  fullReplacedByPreview: string[];
  articleLinks: string[]; // «файл:строка | кейс | дельта | цель»
  articleBorderline: string[];
  quotes: string[];
  unreferencedArticles: string[];
  syntheticTitles: string[];
  dedupedFull: string[];
  sameTitleDateDiffBody: string[];
  winOpenNonImage: number;
  normalizedHits: number;
  internalLinks: number;
  externalLinks: number;
  droppedBadProtoLinks: number;
  teaserCount: number;
  galleryCount: number;
  quoteCount: number;
};

const report: ReportBag = {
  perFile: [],
  merges: [],
  dateFixes: [],
  foreignYear: [],
  lostArticles: [],
  unresolved: [],
  collisions: [],
  fullReplacedByPreview: [],
  articleLinks: [],
  articleBorderline: [],
  quotes: [],
  unreferencedArticles: [],
  syntheticTitles: [],
  dedupedFull: [],
  sameTitleDateDiffBody: [],
  winOpenNonImage: 0,
  normalizedHits: 0,
  internalLinks: 0,
  externalLinks: 0,
  droppedBadProtoLinks: 0,
  teaserCount: 0,
  galleryCount: 0,
  quoteCount: 0,
};

/** Фатальные проблемы разбора: печатаются все разом, прогон падает. */
const runErrors: string[] = [];

// ───────────────────────── манифест ─────────────────────────

type ManifestEntry = { url: string; localPath: string | null; outcome: string };

const manifestByUrl = new Map<string, ManifestEntry>();

function loadManifest(): void {
  const raw = readFileSync(join(ARCHIVE, "download", "manifest.jsonl"), "utf-8").replace(
    /^\uFEFF/,
    "",
  );
  // Последняя строка на URL побеждает — как в тулчейне download.ts.
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as ManifestEntry;
      manifestByUrl.set(e.url, e);
    } catch {
      // повреждённая строка — пропускаем, как download.ts
    }
  }
  // Детектор коллизий: разные URL с outcome=ok на один localPath.
  const byPath = new Map<string, string[]>();
  for (const e of manifestByUrl.values()) {
    if (e.outcome === "ok" && e.localPath) {
      const arr = byPath.get(e.localPath) ?? [];
      arr.push(e.url);
      byPath.set(e.localPath, arr);
    }
  }
  for (const [p, urls] of byPath) {
    if (urls.length > 1) report.collisions.push(`${p} ← ${urls.sort().join(" | ")}`);
  }
  report.collisions.sort();
}

/** Варианты нормализации: http/https × с/без www. */
function urlVariants(url: string): string[] {
  const variants = new Set<string>([url]);
  for (const scheme of ["http://", "https://"]) {
    for (const www of ["", "www."]) {
      variants.add(url.replace(/^https?:\/\/(www\.)?/, `${scheme}${www}`));
    }
  }
  return [...variants];
}

/** Разрешение URL через манифест: точное попадание, затем нормализованные формы. */
function resolveUrl(url: string): ManifestEntry | null {
  const exact = manifestByUrl.get(url);
  if (exact) return exact;
  for (const v of urlVariants(url)) {
    const hit = manifestByUrl.get(v);
    if (hit) {
      report.normalizedHits += 1;
      return hit;
    }
  }
  return null;
}

/** localPath манифеста → относительный путь экспорта (от --archive). */
function exportPath(localPath: string): string {
  return "download\\" + localPath;
}

/**
 * URL → относительный путь архива, если файл реально скачан и лежит на диске.
 * Принимаются outcome=ok и outcome=skipped: skipped в download.ts означает
 * «файл уже существует» (повторные прогоны перекрывают ранний ok статусом
 * skipped — последняя строка манифеста побеждает). Наличие файла проверяется
 * existsSync — итоговая истина на диске, а не в манифесте.
 */
function resolveToPath(url: string): string | null {
  const e = resolveUrl(url);
  if (!e || !e.localPath) return null;
  if (e.outcome !== "ok" && e.outcome !== "skipped") return null;
  if (!existsSync(join(ARCHIVE, "download", e.localPath))) return null;
  return exportPath(e.localPath);
}

// ───────────────────────── утилиты разметки ─────────────────────────

function lineOf(text: string, pos: number): number {
  let line = 1;
  for (let i = 0; i < pos; i++) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** Комментарии → пробелы той же длины: позиции и номера строк не плывут. */
function blankComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

function stripTags(html: string): string {
  // `<` не перед латинской буквой/`/`/`!` — не тег, а опечатка легаси
  // (`<Завершилось …` в заголовках 2016–2022 браузер рендерит как текст).
  return html
    .replace(/<\/?[a-zA-Z!][^>]*>/g, " ")
    .replace(/</g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

/** Абсолютизация href/src относительно страницы; мусорные URL → null. */
function absolutize(raw: string, baseUrl: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "#") return null;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function isTennisfed(url: string): boolean {
  return /^https?:\/\/(www\.)?tennisfed\.spb\.ru(\/|$)/i.test(url);
}

// ───────────────────────── разрезка ленты на чанки ─────────────────────────

const SEPARATOR = /<tr bordercolor="#C5DBF0"/g;

type Chunk = {
  kind: "title" | "body" | "empty";
  start: number;
  end: number;
  line: number;
  /** Содержимое первой ячейки ряда (для title — текст заголовка, для body — тело). */
  cell: string;
};

/**
 * Содержимое первой ячейки `<td …>` чанка: до парного `</td>` на нулевой
 * глубине вложенных таблиц, либо до закрытия внешней таблицы ленты
 * (`</table>` при глубине 0 — легаси местами не закрывает `</td>`),
 * либо до конца чанка.
 */
function firstCellContent(chunkHtml: string): { attrs: string; inner: string } | null {
  const tdOpen = chunkHtml.match(/<td[^>]*>/i);
  if (!tdOpen || tdOpen.index === undefined) return null;
  const from = tdOpen.index + tdOpen[0].length;
  const tagRe = /<(\/?)(table|td)\b[^>]*>/gi;
  tagRe.lastIndex = from;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(chunkHtml))) {
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "table") {
      if (!closing) depth += 1;
      else if (depth > 0) depth -= 1;
      else return { attrs: tdOpen[0], inner: chunkHtml.slice(from, m.index) };
    } else if (tag === "td" && closing && depth === 0) {
      return { attrs: tdOpen[0], inner: chunkHtml.slice(from, m.index) };
    }
  }
  return { attrs: tdOpen[0], inner: chunkHtml.slice(from) };
}

function splitChunks(html: string, file: string): Chunk[] {
  const positions: number[] = [];
  SEPARATOR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SEPARATOR.exec(html))) positions.push(m.index);

  const chunks: Chunk[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : html.length;
    const chunkHtml = html.slice(start, end);
    const line = lineOf(html, start);
    const cell = firstCellContent(chunkHtml);

    if (!cell) {
      // Сдвоенный открывающий <tr> (2015–2017): чанк без <td> — пустой ряд.
      if (stripTags(chunkHtml.replace(/<tr[^>]*>/gi, " ")) === "") {
        chunks.push({ kind: "empty", start, end, line, cell: "" });
        continue;
      }
      runErrors.push(
        `${file}:${line}: нераспознанный ряд (нет <td>, но есть содержимое): ${chunkHtml.slice(0, 160).replace(/\s+/g, " ")}`,
      );
      continue;
    }

    // Порядок проверок принципиален: сначала «заголовочный», потом «тело» —
    // заголовок схемы B (2005) сидит в td class="MainText" и распознаётся
    // только по <span class="Header_BlueBack"> в начале содержимого ячейки.
    const isTitleTd = /class="Header_BlueBack"/.test(cell.attrs);
    const isTitleSpan = /^[\s\S]{0,120}?<span class="Header_BlueBack">/.test(cell.inner);
    if (isTitleTd || isTitleSpan) {
      chunks.push({ kind: "title", start, end, line, cell: cell.inner });
    } else if (/class="MainText[ "]/.test(cell.attrs)) {
      chunks.push({ kind: "body", start, end, line, cell: cell.inner });
    } else {
      runErrors.push(
        `${file}:${line}: нераспознанный ряд (td без Header_BlueBack/MainText): ${cell.attrs} ${cell.inner.slice(0, 120).replace(/\s+/g, " ")}`,
      );
    }
  }
  return chunks;
}

// ───────────────────────── даты ─────────────────────────

const DATE_SPAN_RE =
  /class="(?:SubHeader_BlueBack|MainTextHeader)">\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/;

const RU_MONTHS: Record<string, number> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
};

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** дд.мм.гггг → ISO; невалидный день → последний день месяца (31.11 → 30.11). */
function toIsoFixed(d: number, m: number, y: number): { iso: string; original: string | null } {
  const original = `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
  if (m < 1 || m > 12) return { iso: iso(y, Math.min(Math.max(m, 1), 12), 1), original };
  const last = lastDayOfMonth(y, m);
  if (d < 1 || d > last) return { iso: iso(y, m, Math.min(Math.max(d, 1), last)), original };
  return { iso: iso(y, m, d), original: null };
}

function daysBetween(isoA: string, isoB: string): number {
  return Math.abs((Date.parse(isoA) - Date.parse(isoB)) / 86_400_000);
}

// ───────────────────────── фото ─────────────────────────

type PhotoRef = {
  /** Позиция в исходном HTML — для стабильного порядка. */
  at: number;
  fullUrl: string | null;
  previewUrl: string | null;
};

/** Пары полноразмер/превью и одиночные <img> — только по разметке. */
function extractPhotos(html: string, baseUrl: string): PhotoRef[] {
  const photos: PhotoRef[] = [];
  const consumed: Array<[number, number]> = [];

  // <a href="javascript:window.open('ПОЛНЫЙ'…"><img src=ПРЕВЬЮ>
  const winRe =
    /<a[^>]*href\s*=\s*["']?javascript:window\.open\(\s*'([^']+)'[^>]*>\s*<img[^>]*src\s*=\s*["']?([^"'\s>]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = winRe.exec(html))) {
    // window.open бывает и на article-СТРАНИЦУ (миниатюра-тизер): страница —
    // не полноразмер; без проверки расширения её .html попадал в Галерея и
    // ронял мигратор на imageContentType. Тогда фото — только превью.
    const fullIsImage = IMG_EXT_RE.test(m[1].split("?")[0]);
    if (!fullIsImage) report.winOpenNonImage += 1;
    photos.push({
      at: m.index,
      fullUrl: fullIsImage ? absolutize(m[1], baseUrl) : null,
      previewUrl: absolutize(m[2], baseUrl),
    });
    consumed.push([m.index, m.index + m[0].length]);
  }

  // <a href=ПОЛНЫЙ.jpg…><img src=ПРЕВЬЮ> (галерейные страницы: bg/ + sm/)
  const hrefRe =
    /<a[^>]*href\s*=\s*["']?([^"'\s>]+\.(?:jpe?g|png|gif))["']?[^>]*>\s*<img[^>]*src\s*=\s*["']?([^"'\s>]+)/gi;
  while ((m = hrefRe.exec(html))) {
    const inside = consumed.some(([a, b]) => m!.index >= a && m!.index < b);
    if (inside) continue;
    photos.push({
      at: m.index,
      fullUrl: absolutize(m[1], baseUrl),
      previewUrl: absolutize(m[2], baseUrl),
    });
    consumed.push([m.index, m.index + m[0].length]);
  }

  // одиночные <img> (схема C1)
  const imgRe = /<img[^>]*src\s*=\s*["']?([^"'\s>]+)/gi;
  while ((m = imgRe.exec(html))) {
    const inside = consumed.some(([a, b]) => m!.index >= a && m!.index < b);
    if (inside) continue;
    photos.push({ at: m.index, fullUrl: null, previewUrl: absolutize(m[1], baseUrl) });
  }

  photos.sort((a, b) => a.at - b.at);
  return photos;
}

/** Фото → относительный путь архива: полноразмер приоритетен, иначе превью с пометкой. */
function resolvePhoto(p: PhotoRef, context: string): string | null {
  const tryResolve = (url: string | null): string | null => (url ? resolveToPath(url) : null);
  const full = tryResolve(p.fullUrl);
  if (full) return full;
  const preview = tryResolve(p.previewUrl);
  if (preview) {
    if (p.fullUrl) {
      report.fullReplacedByPreview.push(`${context}: ${p.fullUrl} → превью ${preview}`);
    }
    return preview;
  }
  report.unresolved.push(
    `${context}: фото не разрешено (full=${p.fullUrl ?? "-"}, preview=${p.previewUrl ?? "-"})`,
  );
  return null;
}

// ───────────────────────── документы ─────────────────────────

/**
 * Ссылки на документы: собираются в массив и вырезаются из тела (остаётся
 * текст ссылки). Возвращает html без документных <a>.
 */
function extractDocuments(
  html: string,
  baseUrl: string,
  context: string,
  outDocs: string[],
): string {
  return html.replace(
    /<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi,
    (whole, href: string, inner: string) => {
      const abs = absolutize(href, baseUrl);
      if (!abs || !DOC_EXT_RE.test(abs.split("?")[0])) return whole;
      const p = resolveToPath(abs);
      if (p) {
        if (!outDocs.includes(p)) outDocs.push(p);
        return inner;
      }
      if (isTennisfed(abs)) {
        // Вложение архива утрачено: мёртвую внутреннюю ссылку в теле не оставляем.
        report.unresolved.push(`${context}: документ не разрешён: ${abs}`);
        return inner;
      }
      // Документ на внешнем хосте (tennis-russia.ru, minsport.gov.ru и т.п.):
      // в архив не скачивался — остаётся внешней ссылкой в теле (правило 9).
      return whole;
    },
  );
}

// ───────────────────────── санитайзер ─────────────────────────

const ALLOWED_INLINE = new Set(["b", "strong", "i", "em"]);
/** Теги, чьи границы означают конец абзаца. */
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "table",
  "tr",
  "td",
  "th",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "center",
  "hr",
  "blockquote",
  "marquee",
  "form",
]);

type SanitizeCtx = { baseUrl: string };

/**
 * Тело новости → белый список p, br, a[href], b/strong, i/em.
 * Таблицы вёрстки разворачиваются в последовательность абзацев (границы
 * ячеек/рядов/абзацев — разрывы), script/style, on*-атрибуты и inline-стили удаляются,
 * фото-разметка и служебные фразы изъяты до вызова. В href допускаются
 * только http/https/mailto: прочие протоколы (javascript:, data:,
 * vbscript:) и неабсолютизируемые ссылки заменяются текстом ссылки.
 */
function sanitizeBody(html: string, ctx: SanitizeCtx): string {
  const work = html
    // `<` без последующей латинской буквы/`/`/`!` — литеральный символ
    // (опечатки вида «<Завершился …»), не начало тега.
    .replace(/<(?![a-zA-Z/!])/g, "&lt;")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>/gi, " ")
    // Фото-обёртка целиком (<a …><img …></a> без текста) — иначе от неё
    // остаётся пустой якорь либо ложно срабатывает счётчик javascript-ссылок.
    .replace(/<a[^>]*>\s*<img[^>]*>\s*<\/a>/gi, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/Кликните на фото для увеличения/gi, " ");

  type Para = string[];
  const paras: Para[] = [];
  let current: Para = [];
  const inlineStack: string[] = [];

  const flush = () => {
    while (inlineStack.length) current.push(`</${inlineStack.pop()}>`);
    const text = current
      .join("")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:<br>\s*)+/, "")
      .replace(/(?:\s*<br>)+$/, "");
    // Абзац из одних <br>/пустоты не публикуется.
    if (text && stripTags(text) !== "") paras.push([text]);
    current = [];
  };

  const tokenRe = /<[^>]*>|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(work))) {
    const tok = m[0];
    if (tok[0] !== "<") {
      current.push(tok);
      continue;
    }
    const tagMatch = tok.match(/^<\s*(\/?)([a-zA-Z][a-zA-Z0-9]*)/);
    if (!tagMatch) continue; // мусорный тег
    const closing = tagMatch[1] === "/";
    const tag = tagMatch[2].toLowerCase();

    if (tag === "br") {
      current.push("<br>");
    } else if (BLOCK_TAGS.has(tag)) {
      flush();
    } else if (ALLOWED_INLINE.has(tag)) {
      if (!closing) {
        current.push(`<${tag}>`);
        inlineStack.push(tag);
      } else {
        const idx = inlineStack.lastIndexOf(tag);
        if (idx !== -1) {
          // Закрываем вложенные до искомого — сохраняем корректную вложенность.
          while (inlineStack.length > idx) current.push(`</${inlineStack.pop()}>`);
        }
      }
    } else if (tag === "a") {
      if (closing) {
        const idx = inlineStack.lastIndexOf("a");
        if (idx !== -1) while (inlineStack.length > idx) current.push(`</${inlineStack.pop()}>`);
        continue;
      }
      const hrefMatch = tok.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const rawHref = hrefMatch ? (hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? "") : "";
      const abs = absolutize(rawHref, ctx.baseUrl);
      const proto = abs ? abs.split(":", 1)[0].toLowerCase() : "";
      if (
        abs &&
        (proto === "http" || proto === "https" || rawHref.toLowerCase().startsWith("mailto:"))
      ) {
        const href = rawHref.toLowerCase().startsWith("mailto:")
          ? rawHref
          : isTennisfed(abs)
            ? "http://tennisfed.spb.ru" + new URL(abs).pathname + new URL(abs).search
            : abs;
        if (rawHref.toLowerCase().startsWith("mailto:")) {
          // mailto считаем внешней ссылкой
          report.externalLinks += 1;
        } else if (isTennisfed(abs)) {
          report.internalLinks += 1;
        } else {
          report.externalLinks += 1;
        }
        current.push(`<a href="${href.replace(/"/g, "&quot;")}">`);
        inlineStack.push("a");
      } else {
        // javascript:, data:, vbscript:, пустые и неразбираемые — тег
        // выбрасывается, текст ссылки остаётся.
        report.droppedBadProtoLinks += 1;
      }
    }
    // все прочие теги (span, font, div-атрибуты и т.д.) просто выбрасываются
  }
  flush();

  return paras.map((p) => `<p>${p[0]}</p>`).join("\n");
}

// ───────────────────────── article-страницы ─────────────────────────

type ArticlePage = {
  relFile: string; // "2024/0219.html" | "article20130722.html"
  url: string; // канонический URL
  bodyHtml: string; // содержательная часть (для тизера)
  plainLength: number;
  photosHtml: string; // html, из которого извлекаются фото (та же содержательная часть)
  date: string | null; // ISO
  lost: boolean;
};

const articleCache = new Map<string, ArticlePage | null>();

/** Дата article-страницы: «Опубликовано ДД месяц ГГГГ» (схема D), иначе имя файла. */
function articleDate(text: string, relFile: string): string | null {
  const pub = text.match(/Опубликовано\s*(?:<[^>]*>|\s)*?(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (pub) {
    const mon = RU_MONTHS[pub[2].toLowerCase()];
    if (mon) return toIsoFixed(Number(pub[1]), mon, Number(pub[3])).iso;
  }
  const named = relFile.match(/^(\d{4})[\\/](\d{2})(\d{2})\d*\.html$/);
  if (named) return toIsoFixed(Number(named[3]), Number(named[2]), Number(named[1])).iso;
  const old = relFile.match(/^article(\d{4})(\d{2})(\d{2})\.html$/);
  if (old) return toIsoFixed(Number(old[3]), Number(old[2]), Number(old[1])).iso;
  return null;
}

/**
 * Содержательная часть article-страницы: ряды ленточной таблицы (обёртка
 * схемы C), а если их нет (схема D) — правая колонка от маркера Edit02 до
 * футера.
 */
function loadArticle(relFile: string, url: string): ArticlePage | null {
  const cached = articleCache.get(relFile);
  if (cached !== undefined) return cached;

  const fullPath = join(ARCHIVE, "download", relFile.split("/").join("\\"));
  if (!existsSync(fullPath)) {
    articleCache.set(relFile, null);
    return null;
  }
  const raw = readCp1251(fullPath);
  if (raw.length < 512) {
    // Утраченные article-страницы (тело «No type», outcome=suspect).
    const page: ArticlePage = {
      relFile,
      url,
      bodyHtml: "",
      plainLength: 0,
      photosHtml: "",
      date: null,
      lost: true,
    };
    articleCache.set(relFile, page);
    return page;
  }

  // Регион контента ищем по маркерам-комментариям ДО их вычистки.
  const beginMark = raw.indexOf('InstanceBeginEditable name="Edit02"');
  const endMark = beginMark >= 0 ? raw.indexOf("InstanceEndEditable", beginMark) : -1;
  const region =
    beginMark >= 0 && endMark > beginMark
      ? raw.slice(beginMark, endMark)
      : raw.slice(Math.max(raw.indexOf('<td width="821"'), 0));
  const html = blankComments(region);

  const chunks = splitChunks(html, relFile);
  let bodyHtml: string;
  if (chunks.some((c) => c.kind === "body")) {
    bodyHtml = chunks
      .filter((c) => c.kind === "body")
      .map((c) => c.cell)
      .join("\n");
  } else {
    bodyHtml = html;
  }

  const page: ArticlePage = {
    relFile,
    url,
    bodyHtml,
    plainLength: stripTags(bodyHtml).length,
    photosHtml: bodyHtml,
    date: articleDate(html, relFile),
    lost: false,
  };
  articleCache.set(relFile, page);
  return page;
}

/** href → относительный файл article-страницы ("2024/0219.html") или null. */
function articleRelFile(absUrl: string): string | null {
  if (!isTennisfed(absUrl)) return null;
  const path = new URL(absUrl).pathname;
  const modern = path.match(/^\/(\d{4})\/(\d{3,5})(?:\.html)?$/);
  if (modern) return `${modern[1]}/${modern[2]}.html`;
  const old = path.match(/^\/(article\d{8}\.html)$/);
  if (old) return old[1];
  return null;
}

// ───────────────────────── разбор одного элемента ленты ─────────────────────────

type FeedItem = {
  file: string;
  position: number;
  titleLine: number | null;
  bodyLine: number;
  titleHtml: string | null;
  bodyHtml: string;
  mergedFrom: number[]; // строки склеенных хвостов
};

function extractTitle(item: FeedItem): string | null {
  if (item.titleHtml !== null) {
    const t = stripTags(item.titleHtml);
    if (t) return t;
  }
  // Схема A (2004): заголовка-ряда нет, берём первый <p><strong>…</strong>.
  const strong = item.bodyHtml.match(/<strong>([\s\S]*?)<\/strong>/i);
  if (strong) {
    const t = stripTags(strong[1]);
    if (t) return t;
  }
  return null;
}

function buildRecord(item: FeedItem): OutputRecord | null {
  const context = `${item.file}:${item.bodyLine}`;
  const feedUrl = `${SITE}/${item.file}`;

  let title = extractTitle(item);
  if (!title) {
    // Пустой заголовочный ряд (3 случая: 2018, 2021, 2022) — новость есть,
    // заголовка на странице нет. Синтезируем из первых слов тела; каждый
    // случай — в отчёт отдельным разделом.
    // Оба служебных префикса вырезаются циклически: их порядок в разметке
    // не фиксирован, одиночный проход оставлял дату в начале заголовка.
    let plain = stripTags(item.bodyHtml);
    for (;;) {
      const next = plain
        .replace(/^\d{1,2}\.\d{1,2}\.\d{4}\s*/, "")
        .replace(/^Кликните на фото для увеличения\s*/i, "");
      if (next === plain) break;
      plain = next;
    }
    const words = plain.split(" ").filter(Boolean);
    if (words.length === 0) {
      runErrors.push(`${context}: пустой заголовок и пустое тело`);
      return null;
    }
    let synthetic = "";
    for (const w of words) {
      if (synthetic.length + w.length + 1 > 80) break;
      synthetic += (synthetic ? " " : "") + w;
    }
    title = synthetic + "…";
    report.syntheticTitles.push(`${context}: заголовок пуст, синтезирован: «${title}»`);
  }

  // Дата: первый датный спан тела; второй (2019) остаётся текстом тела.
  const dm = item.bodyHtml.match(DATE_SPAN_RE);
  if (!dm) {
    runErrors.push(`${context}: у записи «${title}» не извлечена дата`);
    return null;
  }
  const fixed = toIsoFixed(Number(dm[1]), Number(dm[2]), Number(dm[3]));
  if (fixed.original) {
    report.dateFixes.push(`${context}: «${title}»: ${fixed.original} → ${fixed.iso}`);
  }
  const isoDate = fixed.iso;
  const recordYear = Number(isoDate.slice(0, 4));
  if (recordYear !== feedYear(item.file)) {
    report.foreignYear.push(`${context}: «${title}» (${isoDate}) в файле ${item.file}`);
  }

  // Датный спан из тела убираем (это шапка «дд.мм.гггг» справа, не текст).
  // Обёртки разные: двойной span (схема C), одинарный (схема A, 2004).
  let feedBody = item.bodyHtml.replace(
    new RegExp(
      `<p[^>]*>[\\s\\S]{0,160}?class="(?:SubHeader_BlueBack|MainTextHeader)">\\s*${dm[1]}\\.${dm[2]}\\.${dm[3]}[\\s\\S]*?</p>`,
      "i",
    ),
    " ",
  );
  // Схема A: заголовок взят из первого <p><strong>…</strong> — не дублируем его в теле.
  if (item.titleHtml === null) {
    const firstStrongPara = feedBody.match(/<p[^>]*>\s*<strong>[\s\S]*?<\/strong>\s*<\/p>/i);
    if (firstStrongPara && stripTags(firstStrongPara[0]) === title) {
      feedBody = feedBody.replace(firstStrongPara[0], " ");
    }
  }

  // ── article-ссылки: три кейса (цитата / тизер / галерея) ──
  type LinkInfo = {
    abs: string;
    relFile: string;
    page: ArticlePage | null;
    kase: "цитата" | "тизер" | "галерея" | "утрачена";
    deltaDays: number | null;
  };
  const links: LinkInfo[] = [];
  const seenRel = new Set<string>();
  const aRe = /<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  let am: RegExpExecArray | null;
  while ((am = aRe.exec(item.bodyHtml))) {
    const abs = absolutize(am[1], feedUrl);
    if (!abs) continue;
    const rel = articleRelFile(abs);
    if (!rel || seenRel.has(rel)) continue;
    seenRel.add(rel);
    const canonicalUrl = `${SITE}/${rel.replace(/\.html$/, "").replace(/^article(\d{8})$/, "article$1.html")}`;
    const page = loadArticle(rel, canonicalUrl);
    if (!page) {
      report.unresolved.push(`${context}: «${title}»: article-ссылка без файла: ${abs}`);
      continue;
    }
    if (page.lost) {
      links.push({ abs, relFile: rel, page, kase: "утрачена", deltaDays: null });
      report.lostArticles.push(`${context}: «${title}» → ${rel} (тело "No type")`);
      continue;
    }
    // Предусловие поглощения: дата article не дальше 60 дней от даты элемента.
    const delta = page.date ? daysBetween(page.date, isoDate) : null;
    if (delta === null || delta > 60) {
      links.push({ abs, relFile: rel, page, kase: "цитата", deltaDays: delta });
      continue;
    }
    // Тизер: фраза-ссылка либо явное превосходство объёма article-текста.
    const feedPlainLen = stripTags(feedBody).length;
    const sentenceWithLink = findLinkSentence(feedBody, am[1]);
    const phraseHit =
      sentenceWithLink !== null && /полн\w*\s+верси|читайте/i.test(sentenceWithLink);
    const sizeHit =
      page.plainLength >= feedPlainLen * 1.5 && page.plainLength - feedPlainLen >= 200;
    if (phraseHit || sizeHit) {
      links.push({ abs, relFile: rel, page, kase: "тизер", deltaDays: delta });
    } else {
      links.push({ abs, relFile: rel, page, kase: "галерея", deltaDays: delta });
      if (!phraseHit && page.plainLength > feedPlainLen) {
        report.articleBorderline.push(
          `${context}: «${title}» → ${rel}: фраза не найдена, объёмы близки (лента ${feedPlainLen}, article ${page.plainLength})`,
        );
      }
    }
  }

  for (const l of links) {
    report.articleLinks.push(
      `${context} | «${title}» | ${l.kase} | Δ=${l.deltaDays === null ? "?" : Math.round(l.deltaDays)} дн. | ${l.relFile}`,
    );
    if (l.kase === "цитата") {
      report.quoteCount += 1;
      report.quotes.push(
        `${context}: «${title}» → ${l.relFile} (Δ=${l.deltaDays === null ? "дата не установлена" : Math.round(l.deltaDays) + " дн."})`,
      );
    }
  }

  const teaser = links.find((l) => l.kase === "тизер") ?? null;
  const absorbed = links.filter((l) => l.kase === "тизер" || l.kase === "галерея");
  if (teaser) report.teaserCount += 1;
  else if (absorbed.length > 0) report.galleryCount += 1;

  // Ссылки на поглощённые article из тела изымаются (текст остаётся),
  // цитатные — остаются и абсолютизируются штатной обработкой <a>.
  const absorbedRel = new Set(absorbed.map((l) => l.relFile));
  const stripAbsorbedLinks = (html: string): string =>
    html.replace(
      /<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi,
      (whole, href: string, inner: string) => {
        const abs = absolutize(href, feedUrl);
        const rel = abs ? articleRelFile(abs) : null;
        return rel && absorbedRel.has(rel) ? inner : whole;
      },
    );

  // ── фото: лента, затем поглощённые article; дедупликация по пути ──
  const photoRefs: PhotoRef[] = extractPhotos(feedBody, feedUrl);
  for (const l of absorbed) {
    if (l.page) photoRefs.push(...extractPhotos(l.page.photosHtml, l.page.url));
  }
  const photoPaths: string[] = [];
  for (const p of photoRefs) {
    const resolved = resolvePhoto(p, `${context}: «${title}»`);
    if (resolved && !photoPaths.includes(resolved)) photoPaths.push(resolved);
  }

  // ── документы из обоих текстов; ссылки в теле заменяются текстом ──
  const docs: string[] = [];
  feedBody = extractDocuments(
    stripAbsorbedLinks(feedBody),
    feedUrl,
    `${context}: «${title}»`,
    docs,
  );
  // Документы — из ВСЕХ поглощённых страниц, как и фото (тизер не отменяет
  // документы галерейных ссылок той же записи); для тизерной страницы
  // сохраняется её html с уже вырезанными документными ссылками — он идёт в тело.
  let articleBody: string | null = null;
  for (const l of absorbed) {
    if (!l.page) continue;
    const stripped = extractDocuments(
      stripAbsorbedLinks(l.page.bodyHtml),
      l.page.url,
      `${context}: «${title}»`,
      docs,
    );
    if (l === teaser) articleBody = stripped;
  }

  // ── тело и анонс ──
  let bodyHtmlOut: string;
  let anons: string | undefined;
  let source: string;
  if (teaser && teaser.page && articleBody !== null) {
    bodyHtmlOut = sanitizeBody(articleBody, { baseUrl: teaser.page.url });
    const feedPlain = stripTags(sanitizeBody(feedBody, { baseUrl: feedUrl }));
    anons = removeLinkSentence(feedPlain) || undefined;
    source = teaser.page.url;
  } else {
    bodyHtmlOut = sanitizeBody(feedBody, { baseUrl: feedUrl });
    anons = undefined;
    source = feedUrl;
  }

  const record: OutputRecord = {
    Заголовок: title,
    Дата: isoDate,
    ...(fixed.original ? { ДатаИсходная: fixed.original } : {}),
    ...(anons ? { Анонс: anons } : {}),
    ТекстHTML: bodyHtmlOut,
    ...(photoPaths.length > 0 ? { Обложка: photoPaths[0] } : {}),
    ...(photoPaths.length > 1 ? { Галерея: photoPaths.slice(1) } : {}),
    ...(docs.length > 0 ? { Документы: docs } : {}),
    Источник: source,
  };
  return record;
}

/** Предложение, содержащее данный href (для проверки фразы-ссылки). */
function findLinkSentence(html: string, href: string): string | null {
  const idx = html.indexOf(href);
  if (idx === -1) return null;
  const plainBefore = stripTags(html.slice(Math.max(0, idx - 400), idx));
  const plainAfter = stripTags(html.slice(idx, idx + 400));
  const before = plainBefore.split(/(?<=[.!?])\s+/).pop() ?? "";
  const after = plainAfter.split(/(?<=[.!?])\s+/)[0] ?? "";
  return `${before} ${after}`;
}

/**
 * Из плоского текста ленты убирается предложение с фразой-ссылкой.
 * «ЗДЕСЬ» — регистрозависимо, как в разметке сайта: флаг i матчил бы
 * обычное слово «здесь» и выкидывал из Анонса легитимные предложения.
 * Ложный пропуск (предложение осталось) допустим, потеря текста — нет.
 */
function removeLinkSentence(plain: string): string {
  return plain
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !(/полн\w*\s+верси/i.test(s) || /\bЗДЕСЬ\b/.test(s)))
    .join(" ")
    .trim();
}

// ───────────────────────── обход файлов ленты ─────────────────────────

type CollectedRecord = { file: string; rec: OutputRecord };

function parseFeedFile(file: string, records: CollectedRecord[]): void {
  const raw = readCp1251(join(ARCHIVE, "archive_pages", file));
  const commentedBodies = countCommentedBodies(raw);
  const html = blankComments(raw);
  const chunks = splitChunks(html, file);

  const items: FeedItem[] = [];
  let mergeCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (c.kind === "empty") continue;
    if (c.kind === "title") {
      // Ищем тело: следующий непустой чанк.
      let j = i + 1;
      while (j < chunks.length && chunks[j].kind === "empty") j++;
      if (j < chunks.length && chunks[j].kind === "body") {
        items.push({
          file,
          position: items.length,
          titleLine: c.line,
          bodyLine: chunks[j].line,
          titleHtml: c.cell,
          bodyHtml: chunks[j].cell,
          mergedFrom: [],
        });
        i = j;
      } else {
        runErrors.push(`${file}:${c.line}: заголовочный ряд без тела`);
      }
    } else {
      // Тело без заголовка: продолжение предыдущей новости (склейка) либо
      // первая запись файла схемы A (2004).
      const prev = items[items.length - 1];
      if (prev) {
        const prevLabel =
          (prev.titleHtml && stripTags(prev.titleHtml)) ||
          stripTags(prev.bodyHtml.match(/<strong>([\s\S]*?)<\/strong>/i)?.[1] ?? "") ||
          stripTags(prev.bodyHtml).slice(0, 60);
        prev.bodyHtml += "\n" + c.cell;
        prev.mergedFrom.push(c.line);
        mergeCount += 1;
        report.merges.push(`${file}:${c.line}: склейка с записью «${prevLabel}»`);
      } else {
        items.push({
          file,
          position: 0,
          titleLine: null,
          bodyLine: c.line,
          titleHtml: null,
          bodyHtml: c.cell,
          mergedFrom: [],
        });
      }
    }
  }

  let produced = 0;
  for (const item of items) {
    const rec = buildRecord(item);
    if (rec) {
      records.push({ file, rec });
      produced += 1;
    }
  }

  report.perFile.push({
    file,
    rows: chunks.length,
    titleRows: chunks.filter((c) => c.kind === "title").length,
    bodyRows: chunks.filter((c) => c.kind === "body").length,
    emptyRows: chunks.filter((c) => c.kind === "empty").length,
    commentedBodies,
    merges: mergeCount,
    records: produced,
  });
}

/** Закомментированные «новости»: ряды-тела внутри <!-- --> исходного текста. */
function countCommentedBodies(raw: string): number {
  let count = 0;
  for (const cm of raw.matchAll(/<!--[\s\S]*?-->/g)) {
    for (const tr of cm[0].matchAll(/<tr bordercolor="#C5DBF0"/g)) {
      void tr;
    }
    count +=
      (cm[0].match(/class="MainText[ "]/g) ?? []).length > 0
        ? (cm[0].match(/<td[^>]*class="MainText[ "]/g) ?? []).length
        : 0;
  }
  return count;
}

// ───────────────────────── бессылочные article-файлы ─────────────────────────

function listUnreferencedArticles(): void {
  const referenced = new Set(articleCache.keys());
  const all: string[] = [];
  const dlDir = join(ARCHIVE, "download");
  for (const entry of readdirSync(dlDir)) {
    if (/^\d{4}$/.test(entry)) {
      for (const f of readdirSync(join(dlDir, entry))) {
        if (f.endsWith(".html")) all.push(`${entry}/${f}`);
      }
    } else if (/^article\d{8}\.html$/.test(entry)) {
      all.push(entry);
    }
  }
  all.sort();
  for (const rel of all) {
    if (!referenced.has(rel)) report.unreferencedArticles.push(rel);
  }
}

// ───────────────────────── дедупликация межфайловых повторов ─────────────────────────

/**
 * Сайт повторял новости на стыках годовых файлов (новогодние поздравления).
 * Полный дубль = нормализованный заголовок + Дата + SHA-1 полного ТекстHTML;
 * остаётся запись из более раннего файла ленты (порядок FEED_FILES = порядок
 * обхода, первая встреченная побеждает), её Источник не меняется. Группы с
 * одинаковыми (заголовок, дата), но разными телами НЕ дедуплицируются — они
 * печатаются в отчёт для ревью глазами (Neva Cup и повторы с разным текстом).
 */
function dedupeRecords(collected: CollectedRecord[]): OutputRecord[] {
  const sha1 = (s: string) => createHash("sha1").update(s, "utf8").digest("hex");
  const norm = (t: string) => t.trim().replace(/\s+/g, " ");

  const byFull = new Map<string, CollectedRecord>();
  const byTitleDate = new Map<string, Array<CollectedRecord & { hash: string }>>();
  const out: OutputRecord[] = [];

  for (const item of collected) {
    const hash = sha1(item.rec["ТекстHTML"]);
    const tdKey = `${norm(item.rec["Заголовок"])}|${item.rec["Дата"]}`;
    const fullKey = `${tdKey}|${hash}`;

    const winner = byFull.get(fullKey);
    if (winner) {
      report.dedupedFull.push(
        `«${item.rec["Заголовок"]}» (${item.rec["Дата"]}): ${winner.file} (Источник: ${winner.rec["Источник"]}) + ` +
          `${item.file} (Источник: ${item.rec["Источник"]}) → оставлен вариант из ${winner.file}`,
      );
      const pf = report.perFile.find((f) => f.file === item.file);
      if (pf) pf.records -= 1;
      continue;
    }
    byFull.set(fullKey, item);
    const arr = byTitleDate.get(tdKey) ?? [];
    arr.push({ ...item, hash });
    byTitleDate.set(tdKey, arr);
    out.push(item.rec);
  }

  for (const group of byTitleDate.values()) {
    if (group.length > 1) {
      report.sameTitleDateDiffBody.push(
        `«${group[0].rec["Заголовок"]}» (${group[0].rec["Дата"]}): ` +
          group
            .map((g) => `${g.file} (Источник: ${g.rec["Источник"]}, sha1 ${g.hash})`)
            .join(" vs "),
      );
    }
  }

  return out;
}

// ───────────────────────── отчёт ─────────────────────────

function renderReport(records: OutputRecord[]): string {
  const L: string[] = [];
  L.push("# parse-report — контрольный прогон парсера архива (этап 8)");
  L.push("");
  L.push("## Счёты по файлам ленты (сверка с рекогносцировкой)");
  L.push("");
  L.push(
    "| Файл | рядов | загол. | тел | пустых | законм. | склеек | записей | ожидание recon (items − склейки) | дельта |",
  );
  L.push("|---|---|---|---|---|---|---|---|---|---|");
  let totalRecords = 0;
  let totalExpected = 0;
  for (const f of report.perFile) {
    const expectedItems = RECON_EXPECTED_ITEMS[f.file] ?? 0;
    const expectedMerges = RECON_EXPECTED_MERGES[f.file] ?? 0;
    const expected = expectedItems - expectedMerges;
    totalRecords += f.records;
    totalExpected += expected;
    L.push(
      `| ${f.file} | ${f.rows} | ${f.titleRows} | ${f.bodyRows} | ${f.emptyRows} | ${f.commentedBodies} | ${f.merges} | ${f.records} | ${expected} | ${f.records - expected} |`,
    );
  }
  L.push(
    `| **итого** | | | | | | | **${totalRecords}** | **${totalExpected}** | **${totalRecords - totalExpected}** |`,
  );
  L.push("");
  L.push(`Записей в JSON: ${records.length}.`);
  L.push("");
  L.push("Отрицательная дельта по файлу — запись, удалённая дедупликацией межфайловых полных");
  L.push("повторов (побеждает более ранний файл ленты; см. раздел «Дедупликация межфайловых");
  L.push("повторов» ниже): счёт файла уменьшается на каждый проигравший дубль.");
  L.push("");

  const section = (title: string, rows: string[], empty = "нет") => {
    L.push(`## ${title} (${rows.length})`);
    L.push("");
    if (rows.length === 0) L.push(`_${empty}_`);
    else for (const r of rows) L.push(`- ${r}`);
    L.push("");
  };

  L.push("Примечание к склейкам: рекогносцировка ожидала 6 (1×2004, 5×2006); седьмая — ряд");
  L.push('`class="MainText style4"` (newsarch_2006.html:1538), который рекогносцировка не считала');
  L.push("элементом вовсе (его датный спан 13.02.2006 был «позиционным остатком»); на итоговое");
  L.push("число записей он не влияет: 56 тел − 50 заголовков = 6 склеек в 2006.");
  L.push("");
  section("Склейки", report.merges);
  section("Дедупликация межфайловых повторов", report.dedupedFull);
  section(
    "Совпадение заголовка и даты при разных телах (НЕ дедуплицировано, для ревью)",
    report.sameTitleDateDiffBody,
  );
  section("Исправления дат", report.dateFixes);
  section("Записи с годом ≠ году файла", report.foreignYear);
  L.push(`## Article-ссылки: кейсы`);
  L.push("");
  L.push(
    `Тизеров: ${report.teaserCount}; галерей (записей с поглощением без тизера): ${report.galleryCount}; цитатных ссылок: ${report.quoteCount}.`,
  );
  L.push("");
  for (const r of report.articleLinks) L.push(`- ${r}`);
  L.push("");
  section("Цитаты (содержимое article НЕ поглощено)", report.quotes);
  section("Пограничные случаи тизер/галерея", report.articleBorderline);
  section("Утраченные article-страницы", report.lostArticles);
  section("Неразрешённые URL", report.unresolved);
  section("Коллизии localPath в манифесте (разные ok-URL на один путь)", report.collisions);
  section("Полноразмер заменён превью", report.fullReplacedByPreview);
  section("Article-файлы без ссылок с лент (не импортируются)", report.unreferencedArticles);
  section(
    "Записи с пустым заголовочным рядом (заголовок синтезирован из первых слов тела)",
    report.syntheticTitles,
  );
  L.push("## Счётчики ссылок");
  L.push("");
  L.push(
    `- window.open на не-изображение (миниатюра учтена как фото без полноразмера): ${report.winOpenNonImage}`,
  );
  L.push(`- нормализованных попаданий в манифест (http/https/www): ${report.normalizedHits}`);
  L.push(`- внутренних tennisfed-ссылок (абсолютизированы): ${report.internalLinks}`);
  L.push(`- внешних ссылок (сохранены): ${report.externalLinks}`);
  L.push(
    `- ссылок с недопустимым протоколом/битым href (заменены текстом): ${report.droppedBadProtoLinks}`,
  );
  L.push("");
  return L.join("\n") + "\n";
}

// ───────────────────────── самотест санитайзера ─────────────────────────

function runSelfTest(): number {
  const ctx: SanitizeCtx = { baseUrl: `${SITE}/news.html` };
  const cases: Array<{ name: string; input: string; check: (out: string) => boolean }> = [
    {
      name: "script-тег удаляется вместе с содержимым",
      input: `<p>до</p><script>alert("x")</script><p>после</p>`,
      check: (o) =>
        !o.includes("script") && !o.includes("alert") && o.includes("до") && o.includes("после"),
    },
    {
      name: "on*-атрибут удаляется",
      input: `<p onclick="steal()">текст</p>`,
      check: (o) => !o.includes("onclick") && !o.includes("steal") && o.includes("<p>текст</p>"),
    },
    {
      name: "javascript-href заменяется текстом ссылки",
      input: `<p><a href="javascript:void(0)">открыть фото</a></p>`,
      check: (o) => !o.includes("javascript") && !o.includes("<a") && o.includes("открыть фото"),
    },
    {
      name: "data-href заменяется текстом ссылки",
      input: `<p><a href="data:text/html,evil">файл</a></p>`,
      check: (o) => !o.includes("data:") && !o.includes("<a") && o.includes("файл"),
    },
    {
      name: "inline-стиль удаляется",
      input: `<p style="position:fixed">текст</p>`,
      check: (o) => !o.includes("style") && o.includes("<p>текст</p>"),
    },
    {
      name: "вложенная таблица разворачивается в абзацы",
      input: `<table><tr><td>первый</td><td><table><tr><td>вложенный</td></tr></table></td></tr></table>`,
      check: (o) =>
        !o.includes("<table") &&
        !o.includes("<td") &&
        o.includes("<p>первый</p>") &&
        o.includes("<p>вложенный</p>"),
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const out = sanitizeBody(c.input, ctx);
    const ok = c.check(out);
    if (!ok) failed += 1;
    console.log(`[${ok ? "OK" : "FAIL"}] ${c.name}`);
    console.log(`  вход:  ${c.input}`);
    console.log(`  выход: ${out}`);
  }
  console.log(`\nСамотест санитайзера: ${cases.length - failed}/${cases.length} прошло`);
  return failed === 0 ? 0 : 1;
}

// ───────────────────────── main ─────────────────────────

function main(): void {
  if (SELF_TEST) {
    process.exit(runSelfTest());
  }

  loadManifest();

  const collected: CollectedRecord[] = [];
  for (const file of FEED_FILES) {
    parseFeedFile(file, collected);
  }
  listUnreferencedArticles();

  if (runErrors.length > 0) {
    console.error(`Прогон остановлен: нераспознанных мест ${runErrors.length}:`);
    for (const e of runErrors) console.error(`  ${e}`);
    process.exit(1);
  }

  const records = dedupeRecords(collected);

  mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(records, null, 2) + "\n";
  writeFileSync(join(OUT_DIR, "news_export_local.json"), json, "utf-8");
  writeFileSync(join(OUT_DIR, "parse-report.md"), renderReport(records), "utf-8");

  console.log(`Записей: ${records.length}`);
  console.log(`JSON: ${join(OUT_DIR, "news_export_local.json")} (${json.length} байт)`);
  console.log(`Отчёт: ${join(OUT_DIR, "parse-report.md")}`);
}

main();
