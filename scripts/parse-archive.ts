/**
 * Парсер архива новостей легаси-сайта tennisfed.spb.ru (этап 8).
 *
 * Запуск:  node scripts/parse-archive.ts --archive=D:\Webarchive --out=D:\Webarchive\export
 * Самотест санитайзера:  node scripts/parse-archive.ts --self-test
 *
 * Профилирование (только измерение, экспорт не меняется ни на байт):
 *   --profile=ПАПКА — дополнительно пишет в ПАПКУ profile.json,
 *   profile-report.md и sample.md (признаки записей, счёты известных
 *   дефектов д1–д5, детерминированная выборка для проверки глазами);
 *   --profile-control=ПОДСТРОКА — каждая запись с подстрокой в заголовке
 *   обязана дать ≥1 сигнал детектора д3, иначе exit 1.
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
  let profile: string | undefined;
  let profileControl: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--archive=")) archive = arg.slice("--archive=".length);
    else if (arg.startsWith("--out=")) out = arg.slice("--out=".length);
    else if (arg.startsWith("--profile=")) profile = arg.slice("--profile=".length);
    else if (arg.startsWith("--profile-control="))
      profileControl = arg.slice("--profile-control=".length);
    else if (arg === "--self-test") selfTest = true;
    else throw new Error(`Неизвестный аргумент: ${arg}`);
  }
  if (!selfTest && (!archive || !out)) {
    throw new Error("Обязательны --archive=ПУТЬ и --out=ПУТЬ (или --self-test)");
  }
  if (profileControl && !profile) {
    throw new Error("--profile-control работает только вместе с --profile=ПАПКА");
  }
  return {
    archive: archive ?? "",
    out: out ?? "",
    selfTest,
    profile: profile ?? "",
    profileControl: profileControl ?? "",
  };
}

const {
  archive: ARCHIVE,
  out: OUT_DIR,
  selfTest: SELF_TEST,
  profile: PROFILE_DIR,
  profileControl: PROFILE_CONTROL,
} = parseArgs(process.argv.slice(2));
const PROFILING = PROFILE_DIR !== "";

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

// ───────────────────────── профиль: захват интермедиатов (--profile) ─────────────────────────

type ProfLink = {
  relFile: string;
  kase: "цитата" | "тизер" | "галерея" | "утрачена";
  layout: "C" | "D" | null;
  deltaDays: number | null;
};

/** Судьба фото одного источника (лента либо article) при разрешении. */
type ProfPhotoSrc = { taken: number; dup: number; unresolved: number };

/** Интермедиаты одного buildRecord — «то, что знает только парсер». */
type ProfCapture = {
  file: string;
  position: number; // 1-based, стабилен при правках текста
  titleVia: "td" | "span" | null;
  merged: boolean;
  syntheticTitle: boolean;
  dateFix: boolean;
  foreignYear: boolean;
  feedFragment: string; // feedBody после удаления датного спана/дубля заголовка схемы A
  feedUrl: string;
  absorbed: Array<{ relFile: string; url: string; bodyHtml: string; layout: "C" | "D" | null }>;
  teaserRelFile: string | null;
  teaserUrl: string | null;
  teaserBodyHtml: string | null;
  links: ProfLink[];
  lostArticle: boolean;
  winOpenNonImage: number;
  previewReplaced: number;
  photoFeed: ProfPhotoSrc;
  photoArticle: ProfPhotoSrc;
};

function newProfCapture(item: FeedItem, feedUrl: string): ProfCapture {
  return {
    file: item.file,
    position: item.position + 1,
    titleVia: item.titleVia,
    merged: item.mergedFrom.length > 0,
    syntheticTitle: false,
    dateFix: false,
    foreignYear: false,
    feedFragment: item.bodyHtml,
    feedUrl,
    absorbed: [],
    teaserRelFile: null,
    teaserUrl: null,
    teaserBodyHtml: null,
    links: [],
    lostArticle: false,
    winOpenNonImage: 0,
    previewReplaced: 0,
    photoFeed: { taken: 0, dup: 0, unresolved: 0 },
    photoArticle: { taken: 0, dup: 0, unresolved: 0 },
  };
}

/** Текущий capture: не-null только внутри buildRecord при --profile. */
let curProf: ProfCapture | null = null;

/** Профиль каждой выжившей записи, по identity OutputRecord. */
const profByRecord = new Map<OutputRecord, ProfCapture>();

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

/**
 * Разрешение URL через манифест: точное попадание, затем нормализованные формы.
 * silent — профильный вызов: счётчики отчёта не трогаются.
 */
function resolveUrl(url: string, silent = false): ManifestEntry | null {
  const exact = manifestByUrl.get(url);
  if (exact) return exact;
  for (const v of urlVariants(url)) {
    const hit = manifestByUrl.get(v);
    if (hit) {
      if (!silent) report.normalizedHits += 1;
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
function resolveToPath(url: string, silent = false): string | null {
  const e = resolveUrl(url, silent);
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
  /** Чем распознан заголовочный ряд: td class (схема C) или span (схема B). Для профиля. */
  titleVia?: "td" | "span";
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
      chunks.push({
        kind: "title",
        start,
        end,
        line,
        cell: cell.inner,
        titleVia: isTitleTd ? "td" : "span",
      });
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
    if (!fullIsImage) {
      report.winOpenNonImage += 1;
      if (curProf) curProf.winOpenNonImage += 1;
    }
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
      if (curProf) curProf.previewReplaced += 1;
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
  silent = false,
): string {
  return html.replace(
    /<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi,
    (whole, href: string, inner: string) => {
      const abs = absolutize(href, baseUrl);
      if (!abs || !DOC_EXT_RE.test(abs.split("?")[0])) return whole;
      const p = resolveToPath(abs, silent);
      if (p) {
        if (!outDocs.includes(p)) outDocs.push(p);
        return inner;
      }
      if (isTennisfed(abs)) {
        // Вложение архива утрачено: мёртвую внутреннюю ссылку в теле не оставляем.
        if (!silent) report.unresolved.push(`${context}: документ не разрешён: ${abs}`);
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

type SanitizeCtx = { baseUrl: string; silent?: boolean };

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
        if (!ctx.silent) {
          if (rawHref.toLowerCase().startsWith("mailto:")) {
            // mailto считаем внешней ссылкой
            report.externalLinks += 1;
          } else if (isTennisfed(abs)) {
            report.internalLinks += 1;
          } else {
            report.externalLinks += 1;
          }
        }
        current.push(`<a href="${href.replace(/"/g, "&quot;")}">`);
        inlineStack.push("a");
      } else {
        // javascript:, data:, vbscript:, пустые и неразбираемые — тег
        // выбрасывается, текст ссылки остаётся.
        if (!ctx.silent) report.droppedBadProtoLinks += 1;
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
  /** Схема вёрстки article: C — ряды ленточной таблицы, D — регион Edit02. Для профиля. */
  layout: "C" | "D" | null;
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
      layout: null,
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
  let layout: "C" | "D";
  if (chunks.some((c) => c.kind === "body")) {
    bodyHtml = chunks
      .filter((c) => c.kind === "body")
      .map((c) => c.cell)
      .join("\n");
    layout = "C";
  } else {
    bodyHtml = html;
    layout = "D";
  }

  const page: ArticlePage = {
    relFile,
    url,
    bodyHtml,
    plainLength: stripTags(bodyHtml).length,
    photosHtml: bodyHtml,
    date: articleDate(html, relFile),
    lost: false,
    layout,
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
  titleVia: "td" | "span" | null; // чем распознан заголовочный ряд (для профиля)
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
  const cap: ProfCapture | null = PROFILING ? newProfCapture(item, feedUrl) : null;
  curProf = cap;

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
      curProf = null;
      return null;
    }
    let synthetic = "";
    for (const w of words) {
      if (synthetic.length + w.length + 1 > 80) break;
      synthetic += (synthetic ? " " : "") + w;
    }
    title = synthetic + "…";
    report.syntheticTitles.push(`${context}: заголовок пуст, синтезирован: «${title}»`);
    if (cap) cap.syntheticTitle = true;
  }

  // Дата: первый датный спан тела; второй (2019) остаётся текстом тела.
  const dm = item.bodyHtml.match(DATE_SPAN_RE);
  if (!dm) {
    runErrors.push(`${context}: у записи «${title}» не извлечена дата`);
    curProf = null;
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
  if (cap) {
    cap.dateFix = fixed.original !== null;
    cap.foreignYear = recordYear !== feedYear(item.file);
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
  // Фрагмент ленты для профиля — то, что дальше реально идёт в конвейер.
  if (cap) cap.feedFragment = feedBody;

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

  if (cap) {
    cap.links = links.map((l) => ({
      relFile: l.relFile,
      kase: l.kase,
      layout: l.page ? l.page.layout : null,
      deltaDays: l.deltaDays,
    }));
    cap.lostArticle = links.some((l) => l.kase === "утрачена");
    for (const l of absorbed) {
      if (!l.page) continue;
      cap.absorbed.push({
        relFile: l.relFile,
        url: l.page.url,
        bodyHtml: l.page.bodyHtml,
        layout: l.page.layout,
      });
    }
    if (teaser && teaser.page) {
      cap.teaserRelFile = teaser.relFile;
      cap.teaserUrl = teaser.page.url;
      cap.teaserBodyHtml = teaser.page.bodyHtml;
    }
  }

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
  const feedRefCount = photoRefs.length;
  for (const l of absorbed) {
    if (l.page) photoRefs.push(...extractPhotos(l.page.photosHtml, l.page.url));
  }
  const photoPaths: string[] = [];
  let refIdx = 0;
  for (const p of photoRefs) {
    const resolved = resolvePhoto(p, `${context}: «${title}»`);
    const src = cap ? (refIdx < feedRefCount ? cap.photoFeed : cap.photoArticle) : null;
    if (resolved && !photoPaths.includes(resolved)) {
      photoPaths.push(resolved);
      if (src) src.taken += 1;
    } else if (src) {
      if (resolved) src.dup += 1;
      else src.unresolved += 1;
    }
    refIdx += 1;
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
  curProf = null;
  if (cap) profByRecord.set(record, cap);
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
          titleVia: c.titleVia ?? null,
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
          titleVia: null,
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

// ───────────────────────── профиль: plain() и чистые функции анализа ─────────────────────────

/**
 * Режим --profile: только измерение. Ни одна функция этого раздела не пишет в
 * `report` и не инкрементирует счётчики манифеста (все обращения — с silent);
 * доказательство — побайтовая неизменность news_export_local.json и
 * parse-report.md при прогоне с флагом и без.
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  laquo: "«",
  raquo: "»",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  bull: "•",
  middot: "·",
  sect: "§",
  para: "¶",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac14: "¼",
  sup2: "²",
  sup3: "³",
  dagger: "†",
  permil: "‰",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  shy: "",
  euro: "€",
  pound: "£",
};

function safeCodePoint(cp: number): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "�";
  }
}

/**
 * Единая нормализация профиля (п.0 ТЗ): снять теги → декодировать сущности
 * (именованные и числовые) → схлопнуть пробелы → trim. Все длины и сравнения
 * профиля считаются только через неё. stripTags боевого пути не трогается.
 */
function plainProf(html: string): string {
  return html
    .replace(/<\/?[a-zA-Z!][^>]*>/g, " ")
    .replace(/</g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m: string, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Белый список санитайзера — всё прочее в источнике «выброшенный тег». */
const PROF_WHITELIST = new Set(["p", "br", "a", "b", "strong", "i", "em"]);

function profDroppedTags(html: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b/g)) {
    const t = m[1].toLowerCase();
    if (!PROF_WHITELIST.has(t)) counts[t] = (counts[t] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Ячейка «с числом»: plain непуст и целиком из цифр/пунктуации счёта. */
const NUMERIC_CELL_RE = /^[\d\s.,:;/()–-]+$/;

type ProfTables = { всего: number; данных: number; вёрстки: number; макс: string | null };

/**
 * Таблицы фрагмента: строки×столбцы и классификация «данных/вёрстки» по доле
 * числовых ячеек ≥ 0,3. Вложенность учитывается стеком: текст вложенной
 * таблицы не считается ячейкой внешней.
 */
function profAnalyzeTables(html: string): ProfTables {
  type Frame = {
    rows: number;
    cellsInRow: number;
    maxCols: number;
    totalCells: number;
    numericCells: number;
    cellBuf: string;
    cellOpen: boolean;
  };
  const done: Array<{ rows: number; cols: number; data: boolean }> = [];
  const stack: Frame[] = [];
  const closeCell = (f: Frame) => {
    if (!f.cellOpen) return;
    const t = plainProf(f.cellBuf);
    f.totalCells += 1;
    if (t !== "" && NUMERIC_CELL_RE.test(t)) f.numericCells += 1;
    f.cellOpen = false;
    f.cellBuf = "";
  };
  const endRow = (f: Frame) => {
    f.maxCols = Math.max(f.maxCols, f.cellsInRow);
    f.cellsInRow = 0;
  };
  const tagRe = /<(\/?)(table|tr|td|th)\b[^>]*>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    const top = stack[stack.length - 1];
    if (top && top.cellOpen) top.cellBuf += html.slice(last, m.index);
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "table") {
      if (!closing) {
        stack.push({
          rows: 0,
          cellsInRow: 0,
          maxCols: 0,
          totalCells: 0,
          numericCells: 0,
          cellBuf: "",
          cellOpen: false,
        });
      } else {
        const f = stack.pop();
        if (f) {
          closeCell(f);
          endRow(f);
          done.push({
            rows: f.rows,
            cols: f.maxCols,
            data: f.totalCells > 0 && f.numericCells / f.totalCells >= 0.3,
          });
        }
      }
      continue;
    }
    const f = stack[stack.length - 1];
    if (!f) continue;
    if (tag === "tr") {
      closeCell(f);
      endRow(f);
      if (!closing) f.rows += 1;
    } else {
      // td | th
      closeCell(f);
      if (!closing) {
        f.cellOpen = true;
        f.cellsInRow += 1;
      }
    }
  }
  // Незакрытые <table> легаси — досчитываем как закрытые.
  while (stack.length) {
    const f = stack.pop()!;
    closeCell(f);
    endRow(f);
    done.push({
      rows: f.rows,
      cols: f.maxCols,
      data: f.totalCells > 0 && f.numericCells / f.totalCells >= 0.3,
    });
  }
  let макс: string | null = null;
  let maxArea = -1;
  for (const t of done) {
    if (t.rows * t.cols > maxArea) {
      maxArea = t.rows * t.cols;
      макс = `${t.rows}×${t.cols}`;
    }
  }
  return {
    всего: done.length,
    данных: done.filter((t) => t.data).length,
    вёрстки: done.filter((t) => !t.data).length,
    макс,
  };
}

type ProfAlign = {
  center: number;
  alignCenter: number;
  style: number;
  color: number;
  fontColor: number;
};

function profAlignStyles(html: string): ProfAlign {
  const count = (re: RegExp) => (html.match(re) ?? []).length;
  return {
    center: count(/<center\b/gi),
    alignCenter: count(/align\s*=\s*["']?center/gi),
    style: count(/\sstyle\s*=/gi),
    color: count(/\scolor\s*=/gi),
    fontColor: count(/<font\b[^>]*\scolor\s*=/gi),
  };
}

type ProfPhotoMarkup = { пар: number; потерянныхImg: number; alt: number; title: number };

/**
 * Фото-разметка фрагмента: пары полноразмер/превью по тем же регэкспам, что
 * extractPhotos (копии литералов: общие /g-регэкспы делили бы lastIndex);
 * «потерянный img» — <img> вне распознанной пары (семантика зафиксирована
 * самотестом ТЗ). Манифест не нужен — чисто по разметке.
 */
function profPhotoMarkup(html: string): ProfPhotoMarkup {
  const winRe =
    /<a[^>]*href\s*=\s*["']?javascript:window\.open\(\s*'([^']+)'[^>]*>\s*<img[^>]*src\s*=\s*["']?([^"'\s>]+)/gi;
  const hrefRe =
    /<a[^>]*href\s*=\s*["']?([^"'\s>]+\.(?:jpe?g|png|gif))["']?[^>]*>\s*<img[^>]*src\s*=\s*["']?([^"'\s>]+)/gi;
  const consumed: Array<[number, number]> = [];
  let пар = 0;
  let alt = 0;
  let title = 0;
  const noteImgAttrs = (m: RegExpExecArray) => {
    const imgAt = html.indexOf("<img", m.index);
    if (imgAt === -1) return;
    const end = html.indexOf(">", imgAt);
    const tag = end === -1 ? html.slice(imgAt) : html.slice(imgAt, end + 1);
    if (/\balt\s*=\s*("[^"]+"|'[^']+'|[^"'\s>]+)/i.test(tag)) alt += 1;
    if (/\btitle\s*=\s*("[^"]+"|'[^']+'|[^"'\s>]+)/i.test(tag)) title += 1;
  };
  let m: RegExpExecArray | null;
  while ((m = winRe.exec(html))) {
    пар += 1;
    consumed.push([m.index, m.index + m[0].length]);
    noteImgAttrs(m);
  }
  while ((m = hrefRe.exec(html))) {
    const inside = consumed.some(([a, b]) => m!.index >= a && m!.index < b);
    if (inside) continue;
    пар += 1;
    consumed.push([m.index, m.index + m[0].length]);
    noteImgAttrs(m);
  }
  let потерянныхImg = 0;
  const imgRe = /<img\b/gi;
  while ((m = imgRe.exec(html))) {
    const inside = consumed.some(([a, b]) => m!.index >= a && m!.index < b);
    if (!inside) потерянныхImg += 1;
  }
  return { пар, потерянныхImg, alt, title };
}

type ProfLinks = {
  внешние: number;
  внутренние: number;
  mailto: number;
  вложенияТекстом: number;
  неразрешённые: number;
};

/**
 * Классификация <a> фрагмента по правилам sanitizeBody + extractDocuments
 * (профильная копия решений, манифест — только silent). Фото-обёртки
 * (<a><img></a> без текста) пропускаются, как и в санитайзере.
 */
function profClassifyLinks(html: string, baseUrl: string): ProfLinks {
  const out: ProfLinks = {
    внешние: 0,
    внутренние: 0,
    mailto: 0,
    вложенияТекстом: 0,
    неразрешённые: 0,
  };
  const aRe = /<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = aRe.exec(html))) {
    const rawHref = m[1];
    const inner = m[2];
    if (/^\s*<img[^>]*>\s*$/i.test(inner)) continue; // фото-обёртка
    if (rawHref.toLowerCase().startsWith("mailto:")) {
      out.mailto += 1;
      continue;
    }
    const abs = absolutize(rawHref, baseUrl);
    if (!abs) {
      out.неразрешённые += 1;
      continue;
    }
    const proto = abs.split(":", 1)[0].toLowerCase();
    if (proto !== "http" && proto !== "https") {
      out.неразрешённые += 1; // javascript:, data:, … — санитайзер заменит текстом
      continue;
    }
    if (DOC_EXT_RE.test(abs.split("?")[0])) {
      if (resolveToPath(abs, true)) out.вложенияТекстом += 1;
      else if (isTennisfed(abs)) out.неразрешённые += 1;
      else out.внешние += 1; // внешний документ остаётся ссылкой (правило 9)
      continue;
    }
    if (isTennisfed(abs)) out.внутренние += 1;
    else out.внешние += 1;
  }
  return out;
}

type ProfMojibake = { fffd: boolean; latin1: boolean; вопросы: boolean; чередованиеРС: boolean };

function profMojibake(plainText: string): ProfMojibake {
  return {
    fffd: plainText.includes("�"),
    latin1: /[ÃÂÐÑ]|â€/.test(plainText),
    вопросы: /\?{3,}/.test(plainText),
    чередованиеРС: /(?:[РС]\S){4,}/.test(plainText),
  };
}

type SrcFeatures = {
  длинаPlain: number;
  выброшенныеТеги: Record<string, number>;
  таблицы: ProfTables;
  выравнивание: ProfAlign;
  фотоРазметка: ProfPhotoMarkup;
  ссылки: ProfLinks;
  моджибейк: ProfMojibake;
};

function profSrcFeatures(html: string, baseUrl: string): SrcFeatures {
  const p = plainProf(html);
  return {
    длинаPlain: p.length,
    выброшенныеТеги: profDroppedTags(html),
    таблицы: profAnalyzeTables(html),
    выравнивание: profAlignStyles(html),
    фотоРазметка: profPhotoMarkup(html),
    ссылки: profClassifyLinks(html, baseUrl),
    моджибейк: profMojibake(p),
  };
}

function mergeSrcFeatures(a: SrcFeatures, b: SrcFeatures): SrcFeatures {
  const tags: Record<string, number> = { ...a.выброшенныеТеги };
  for (const [k, v] of Object.entries(b.выброшенныеТеги)) tags[k] = (tags[k] ?? 0) + v;
  const parseМакс = (s: string | null): number =>
    s === null ? -1 : s.split("×").reduce((x, y) => Number(x) * Number(y), 1);
  return {
    длинаPlain: a.длинаPlain + b.длинаPlain,
    выброшенныеТеги: Object.fromEntries(Object.entries(tags).sort(([x], [y]) => (x < y ? -1 : 1))),
    таблицы: {
      всего: a.таблицы.всего + b.таблицы.всего,
      данных: a.таблицы.данных + b.таблицы.данных,
      вёрстки: a.таблицы.вёрстки + b.таблицы.вёрстки,
      макс:
        parseМакс(a.таблицы.макс) >= parseМакс(b.таблицы.макс) ? a.таблицы.макс : b.таблицы.макс,
    },
    выравнивание: {
      center: a.выравнивание.center + b.выравнивание.center,
      alignCenter: a.выравнивание.alignCenter + b.выравнивание.alignCenter,
      style: a.выравнивание.style + b.выравнивание.style,
      color: a.выравнивание.color + b.выравнивание.color,
      fontColor: a.выравнивание.fontColor + b.выравнивание.fontColor,
    },
    фотоРазметка: {
      пар: a.фотоРазметка.пар + b.фотоРазметка.пар,
      потерянныхImg: a.фотоРазметка.потерянныхImg + b.фотоРазметка.потерянныхImg,
      alt: a.фотоРазметка.alt + b.фотоРазметка.alt,
      title: a.фотоРазметка.title + b.фотоРазметка.title,
    },
    ссылки: {
      внешние: a.ссылки.внешние + b.ссылки.внешние,
      внутренние: a.ссылки.внутренние + b.ссылки.внутренние,
      mailto: a.ссылки.mailto + b.ссылки.mailto,
      вложенияТекстом: a.ссылки.вложенияТекстом + b.ссылки.вложенияТекстом,
      неразрешённые: a.ссылки.неразрешённые + b.ссылки.неразрешённые,
    },
    моджибейк: {
      fffd: a.моджибейк.fffd || b.моджибейк.fffd,
      latin1: a.моджибейк.latin1 || b.моджибейк.latin1,
      вопросы: a.моджибейк.вопросы || b.моджибейк.вопросы,
      чередованиеРС: a.моджибейк.чередованиеРС || b.моджибейк.чередованиеРС,
    },
  };
}

// ───────────────────────── профиль: детекторы д1–д5 ─────────────────────────

/** д1: остаточные HTML-сущности в плоских полях (по СЫРЫМ строкам, без plain). */
const D1_RE = /&[a-zA-Z]+;|&#\d+;|&#x[0-9a-fA-F]+;/;

const D2_SUBSTRINGS = [
  "<!--",
  "-->",
  "InstanceBegin",
  "InstanceEnd",
  "TemplateBeginEditable",
  "TemplateEndEditable",
];

/** Обрывок Dreamweaver-комментария на границе (начало/конец строки). */
const D2_EDGE_RE = /^!(?:--|–)|!(?:--|–)$/;

function d2HitsText(s: string): boolean {
  return D2_SUBSTRINGS.some((sub) => s.includes(sub)) || D2_EDGE_RE.test(s.trim());
}

/** д3(б): подстрока длиной ≥120, встречающаяся в plain-теле дважды. */
function profHasDup120(s: string): boolean {
  const W = 120;
  if (s.length < W + 1) return false;
  const seen = new Set<string>();
  for (let i = 0; i + W <= s.length; i++) {
    const w = s.slice(i, i + W);
    if (seen.has(w)) return true;
    seen.add(w);
  }
  return false;
}

/**
 * д3(г): общая подстрока ≥120 символов (без учёта пробелов) между
 * plain(Анонс) и plain(тела) — анонс задвоен в теле. Добавлен по итогам
 * контроля: у записи «Праздничная тренировка группы Полины Игнатовой (ПТА)»
 * тело (текст article) начинается с текста тизера, который одновременно
 * лежит в Анонсе; дубль — между анонсом и телом, внутри самого тела повтора
 * нет, и сигналы (а)/(б)/(в) его по построению не видят. Пробелы перед
 * сравнением снимаются: plain() заменяет inline-теги пробелом, и «<strong>24
 * февраля</strong>,» даёт «24 февраля ,» против «24 февраля,» в Анонсе —
 * пробельные артефакты границ тегов рвали бы общий фрагмент.
 */
function profHasCommonRun120(anons: string, body: string): boolean {
  const W = 120;
  const a = anons.replace(/\s+/g, "");
  const b = body.replace(/\s+/g, "");
  if (a.length < W || b.length < W) return false;
  const bodyGrams = new Set<string>();
  for (let i = 0; i + W <= b.length; i++) bodyGrams.add(b.slice(i, i + W));
  for (let i = 0; i + W <= a.length; i++) {
    if (bodyGrams.has(a.slice(i, i + W))) return true;
  }
  return false;
}

/**
 * д3(в): собственный набор фраз-триггеров тизера (не производственная
 * константа — та остаётся как есть, расхождение покрытия фиксируется в PR).
 */
const D3V_TRIGGERS: Array<{ id: string; test: (s: string) => boolean }> = [
  { id: "полн…верси", test: (s) => /полн[а-яё]*\s+верси/i.test(s) },
  { id: "ЗДЕСЬ", test: (s) => s.includes("ЗДЕСЬ") },
  { id: "читайте", test: (s) => /читайте/i.test(s) },
];

// ───────────────────────── профиль: сборка записи профиля ─────────────────────────

type ProfileKey = {
  файл: string;
  номер: number;
  датаISO: string;
  дата: string;
  заголовок: string;
  article: string | null;
};

type TransformFeatures = {
  схемаЛенты: "A" | "B" | "C";
  схемаArticle: "C" | "D" | null;
  кейсArticle: "нет" | "цитата" | "тизер" | "галерея" | "утрачена";
  ссылкиArticle: ProfLink[];
  склейка: boolean;
  синтетическийЗаголовок: boolean;
  правкаДаты: boolean;
  годЧужой: boolean;
  заменаПолноразмераПревью: number;
  windowOpenНеКартинка: number;
  фотоИзЛенты: number;
  фотоИзArticle: number;
  обаИсточникаФото: boolean;
  фотоДедупЛента: number;
  фотоДедупArticle: number;
  фотоНеразрешеноЛента: number;
  фотоНеразрешеноArticle: number;
  документы: number;
  расширенияДокументов: string[];
  параОдноимённых: boolean;
  articleУтрачен: boolean;
};

type ResultFeatures = {
  длинаPlainТела: number;
  длинаЗаголовка: number;
  естьАнонс: boolean;
  длинаАнонса: number | null;
  фотоВсего: number;
  документов: number;
  ссылокВТеле: number;
  бакетТело: string;
  бакетФото: string;
  бакетДокументы: string;
  бакетСсылки: string;
  бакетГод: string;
  псевдоЗаголовки: number;
  псевдоСписки: number;
  пустыхP: number;
  br3Подряд: number;
  nbsp3Подряд: number;
};

type Detectors = {
  д1: { заголовок: boolean; анонс: boolean; документы: boolean; любое: boolean };
  д2: { тело: boolean; поля: boolean; любое: boolean };
  д3: { а: boolean | null; б: boolean; в: string[]; г: boolean | null; любое: boolean };
  д4: boolean;
  д5: boolean;
};

type ProfileRecord = {
  ключ: ProfileKey;
  источник: { лента: SrcFeatures; article: SrcFeatures | null; сумма: SrcFeatures };
  трансформация: TransformFeatures;
  результат: ResultFeatures;
  детекторы: Detectors;
};

const bodyBucket = (n: number): string =>
  n === 0 ? "0" : n <= 200 ? "1–200" : n <= 1000 ? "201–1000" : n <= 4000 ? "1001–4000" : "4000+";
const photoBucket = (n: number): string =>
  n === 0 ? "0" : n === 1 ? "1" : n <= 5 ? "2–5" : n <= 20 ? "6–20" : n <= 50 ? "21–50" : "51+";
const docBucket = (n: number): string => (n === 0 ? "0" : n === 1 ? "1" : "2+");
const linkBucket = (n: number): string => (n === 0 ? "0" : n <= 3 ? "1–3" : "4+");
const yearBucket = (y: number): string =>
  y <= 2005
    ? "2004–2005"
    : y <= 2009
      ? "2006–2009"
      : y <= 2014
        ? "2010–2014"
        : y <= 2019
          ? "2015–2019"
          : "2020–2026";

const ddmmyyyy = (isoDate: string): string => {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
};

function profResultFeatures(rec: OutputRecord): ResultFeatures {
  const body = rec["ТекстHTML"];
  const pBody = plainProf(body);
  const paras = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
  let псевдоЗаголовки = 0;
  for (const inner of paras) {
    if (/^\s*<(b|strong)>((?:(?!<\/\1>)[\s\S])*)<\/\1>\s*$/i.test(inner)) псевдоЗаголовки += 1;
  }
  const listStart = (s: string) => /^(?:[-–•]|\d+[.)])(?:\s|$)/.test(s);
  let псевдоСписки = 0;
  let run = 0;
  for (const inner of paras) {
    if (listStart(plainProf(inner))) {
      run += 1;
    } else {
      if (run >= 2) псевдоСписки += 1;
      run = 0;
    }
  }
  if (run >= 2) псевдоСписки += 1;
  const фотоВсего = (rec["Обложка"] ? 1 : 0) + (rec["Галерея"]?.length ?? 0);
  const документов = rec["Документы"]?.length ?? 0;
  const ссылокВТеле = (body.match(/<a /g) ?? []).length;
  return {
    длинаPlainТела: pBody.length,
    длинаЗаголовка: plainProf(rec["Заголовок"]).length,
    естьАнонс: rec["Анонс"] !== undefined,
    длинаАнонса: rec["Анонс"] !== undefined ? plainProf(rec["Анонс"]).length : null,
    фотоВсего,
    документов,
    ссылокВТеле,
    бакетТело: bodyBucket(pBody.length),
    бакетФото: photoBucket(фотоВсего),
    бакетДокументы: docBucket(документов),
    бакетСсылки: linkBucket(ссылокВТеле),
    бакетГод: yearBucket(Number(rec["Дата"].slice(0, 4))),
    псевдоЗаголовки,
    псевдоСписки,
    пустыхP: (body.match(/<p>\s*<\/p>/g) ?? []).length,
    br3Подряд: (body.match(/(?:<br>\s*){3,}/g) ?? []).length,
    nbsp3Подряд: (body.match(/(?:&nbsp;\s*){3,}/g) ?? []).length,
  };
}

function profDetectors(rec: OutputRecord, cap: ProfCapture): Detectors {
  const body = rec["ТекстHTML"];
  const pBody = plainProf(body);
  const д1 = {
    заголовок: D1_RE.test(rec["Заголовок"]),
    анонс: rec["Анонс"] !== undefined && D1_RE.test(rec["Анонс"]),
    документы: (rec["Документы"] ?? []).some((d) => D1_RE.test(d)),
    любое: false,
  };
  д1.любое = д1.заголовок || д1.анонс || д1.документы;

  const paras = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => plainProf(m[1]));
  const д2тело =
    D2_SUBSTRINGS.some((s) => body.includes(s)) || paras.some((p) => D2_EDGE_RE.test(p));
  const д2поля =
    d2HitsText(rec["Заголовок"]) || (rec["Анонс"] !== undefined && d2HitsText(rec["Анонс"]));
  const д2 = { тело: д2тело, поля: д2поля, любое: д2тело || д2поля };

  let а: boolean | null;
  if (cap.merged) {
    а = null; // склейки исключены из (а), помечены флагом «склейка»
  } else {
    // Зеркало боевого конвейера (иначе plain расходится на швах вырезанных
    // <a>): stripAbsorbedLinks (база — feedUrl, как в buildRecord) +
    // extractDocuments в silent, затем sanitizeBody с теми же baseUrl.
    const absorbedRel = new Set(cap.absorbed.map((a2) => a2.relFile));
    const stripAbsorbed = (html: string): string =>
      html.replace(
        /<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi,
        (whole, href: string, inner: string) => {
          const abs2 = absolutize(href, cap.feedUrl);
          const rel = abs2 ? articleRelFile(abs2) : null;
          return rel && absorbedRel.has(rel) ? inner : whole;
        },
      );
    const tmpDocs: string[] = [];
    const feedPrepared = extractDocuments(
      stripAbsorbed(cap.feedFragment),
      cap.feedUrl,
      "",
      tmpDocs,
      true,
    );
    const sanFeed = plainProf(sanitizeBody(feedPrepared, { baseUrl: cap.feedUrl, silent: true }));
    let sanArt: string | null = null;
    if (cap.teaserBodyHtml !== null && cap.teaserUrl !== null) {
      const artPrepared = extractDocuments(
        stripAbsorbed(cap.teaserBodyHtml),
        cap.teaserUrl,
        "",
        tmpDocs,
        true,
      );
      sanArt = plainProf(sanitizeBody(artPrepared, { baseUrl: cap.teaserUrl, silent: true }));
    }
    а = pBody !== sanFeed && (sanArt === null || pBody !== sanArt);
  }
  const б = profHasDup120(pBody);
  const в = D3V_TRIGGERS.filter((t) => t.test(pBody)).map((t) => t.id);
  const г = rec["Анонс"] !== undefined ? profHasCommonRun120(plainProf(rec["Анонс"]), pBody) : null;
  const д3 = { а, б, в, г, любое: а === true || б || в.length > 0 || г === true };

  return {
    д1,
    д2,
    д3,
    д4: pBody.length < 30,
    д5: rec["Анонс"] !== undefined && pBody === plainProf(rec["Анонс"]),
  };
}

function buildProfileRecord(rec: OutputRecord, cap: ProfCapture, пара: boolean): ProfileRecord {
  const лента = profSrcFeatures(cap.feedFragment, cap.feedUrl);
  let article: SrcFeatures | null = null;
  for (const a of cap.absorbed) {
    const f = profSrcFeatures(a.bodyHtml, a.url);
    article = article === null ? f : mergeSrcFeatures(article, f);
  }
  const сумма = article === null ? лента : mergeSrcFeatures(лента, article);

  const кейс: TransformFeatures["кейсArticle"] = cap.teaserRelFile
    ? "тизер"
    : cap.absorbed.length > 0
      ? "галерея"
      : cap.links.some((l) => l.kase === "утрачена")
        ? "утрачена"
        : cap.links.some((l) => l.kase === "цитата")
          ? "цитата"
          : "нет";
  const схемаArticle =
    cap.absorbed.find((a) => a.relFile === cap.teaserRelFile)?.layout ??
    cap.absorbed[0]?.layout ??
    null;
  const расширения = [
    ...new Set(
      (rec["Документы"] ?? []).map((d) => {
        const m = d.toLowerCase().match(/\.[a-z0-9]+$/);
        return m ? m[0] : "(без расширения)";
      }),
    ),
  ].sort();

  const трансформация: TransformFeatures = {
    схемаЛенты: cap.titleVia === null ? "A" : cap.titleVia === "span" ? "B" : "C",
    схемаArticle,
    кейсArticle: кейс,
    ссылкиArticle: cap.links,
    склейка: cap.merged,
    синтетическийЗаголовок: cap.syntheticTitle,
    правкаДаты: cap.dateFix,
    годЧужой: cap.foreignYear,
    заменаПолноразмераПревью: cap.previewReplaced,
    windowOpenНеКартинка: cap.winOpenNonImage,
    фотоИзЛенты: cap.photoFeed.taken,
    фотоИзArticle: cap.photoArticle.taken,
    обаИсточникаФото: cap.photoFeed.taken > 0 && cap.photoArticle.taken > 0,
    фотоДедупЛента: cap.photoFeed.dup,
    фотоДедупArticle: cap.photoArticle.dup,
    фотоНеразрешеноЛента: cap.photoFeed.unresolved,
    фотоНеразрешеноArticle: cap.photoArticle.unresolved,
    документы: rec["Документы"]?.length ?? 0,
    расширенияДокументов: расширения,
    параОдноимённых: пара,
    articleУтрачен: cap.lostArticle,
  };

  return {
    ключ: {
      файл: cap.file,
      номер: cap.position,
      датаISO: rec["Дата"],
      дата: ddmmyyyy(rec["Дата"]),
      заголовок: rec["Заголовок"],
      article: cap.teaserRelFile ?? cap.absorbed[0]?.relFile ?? cap.links[0]?.relFile ?? null,
    },
    источник: { лента, article, сумма },
    трансформация,
    результат: profResultFeatures(rec),
    детекторы: profDetectors(rec, cap),
  };
}

// ───────────────────────── профиль: отбор выборки (п.7) ─────────────────────────

/** Классический mulberry32 — детерминированный PRNG для 8 «обычных» записей. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Goal = { id: string; pred: (p: ProfileRecord) => boolean };

const MERGED_TAG_GOAL = ["iframe", "embed", "object", "video"];

function buildGoals(profs: ProfileRecord[]): Goal[] {
  const goals: Goal[] = [];
  const bucketGoals: Array<[string, string[], (p: ProfileRecord) => string]> = [
    ["тело", ["0", "1–200", "201–1000", "1001–4000", "4000+"], (p) => p.результат.бакетТело],
    ["фото", ["0", "1", "2–5", "6–20", "21–50", "51+"], (p) => p.результат.бакетФото],
    ["док", ["0", "1", "2+"], (p) => p.результат.бакетДокументы],
    ["ссылки", ["0", "1–3", "4+"], (p) => p.результат.бакетСсылки],
    [
      "год",
      ["2004–2005", "2006–2009", "2010–2014", "2015–2019", "2020–2026"],
      (p) => p.результат.бакетГод,
    ],
  ];
  for (const [name, values, f] of bucketGoals) {
    for (const v of values) goals.push({ id: `${name}=${v}`, pred: (p) => f(p) === v });
  }
  for (const v of ["A", "B", "C"] as const) {
    goals.push({ id: `схемаЛенты=${v}`, pred: (p) => p.трансформация.схемаЛенты === v });
  }
  for (const v of ["C", "D"] as const) {
    goals.push({ id: `схемаArticle=${v}`, pred: (p) => p.трансформация.схемаArticle === v });
  }
  for (const v of ["нет", "цитата", "тизер", "галерея", "утрачена"] as const) {
    goals.push({ id: `кейс=${v}`, pred: (p) => p.трансформация.кейсArticle === v });
  }
  const t = (id: string, pred: (p: ProfileRecord) => boolean) => goals.push({ id, pred });
  t("склейка", (p) => p.трансформация.склейка);
  t("синтетическийЗаголовок", (p) => p.трансформация.синтетическийЗаголовок);
  t("правкаДаты", (p) => p.трансформация.правкаДаты);
  t("годЧужой", (p) => p.трансформация.годЧужой);
  t("заменаПревью", (p) => p.трансформация.заменаПолноразмераПревью > 0);
  t("winOpenНеКартинка", (p) => p.трансформация.windowOpenНеКартинка > 0);
  t("обаИсточникаФото", (p) => p.трансформация.обаИсточникаФото);
  t("фотоДедуп", (p) => p.трансформация.фотоДедупЛента + p.трансформация.фотоДедупArticle > 0);
  t(
    "фотоНеразрешено",
    (p) => p.трансформация.фотоНеразрешеноЛента + p.трансформация.фотоНеразрешеноArticle > 0,
  );
  t("параОдноимённых", (p) => p.трансформация.параОдноимённых);
  t("articleУтрачен", (p) => p.трансформация.articleУтрачен);
  t("д1", (p) => p.детекторы.д1.любое);
  t("д2", (p) => p.детекторы.д2.любое);
  t("д3а", (p) => p.детекторы.д3.а === true);
  t("д3б", (p) => p.детекторы.д3.б);
  t("д3в", (p) => p.детекторы.д3.в.length > 0);
  t("д3г", (p) => p.детекторы.д3.г === true);
  t("д4", (p) => p.детекторы.д4);
  t("д5", (p) => p.детекторы.д5);
  t("потерянныйImg", (p) => p.источник.сумма.фотоРазметка.потерянныхImg > 0);
  t("моджибейк:fffd", (p) => p.источник.сумма.моджибейк.fffd);
  t("моджибейк:latin1", (p) => p.источник.сумма.моджибейк.latin1);
  t("моджибейк:???", (p) => p.источник.сумма.моджибейк.вопросы);
  t("моджибейк:РС", (p) => p.источник.сумма.моджибейк.чередованиеРС);
  // Ненулевые по популяции выброшенные теги — флагами; iframe|embed|object|video — одним.
  const tagNames = new Set<string>();
  for (const p of profs)
    for (const k of Object.keys(p.источник.сумма.выброшенныеТеги)) tagNames.add(k);
  let mergedAdded = false;
  for (const name of [...tagNames].sort()) {
    if (MERGED_TAG_GOAL.includes(name)) {
      if (!mergedAdded) {
        mergedAdded = true;
        goals.push({
          id: "тег:iframe|embed|object|video",
          pred: (p) => MERGED_TAG_GOAL.some((n) => (p.источник.сумма.выброшенныеТеги[n] ?? 0) > 0),
        });
      }
      continue;
    }
    goals.push({
      id: `тег:${name}`,
      pred: (p) => (p.источник.сумма.выброшенныеТеги[name] ?? 0) > 0,
    });
  }
  return goals;
}

/** «Обычная» запись: ни флагов п.3 (кроме «нет article»), ни выброшенных тегов, детекторы молчат, тело 201–4000. */
function isOrdinary(p: ProfileRecord): boolean {
  const tr = p.трансформация;
  const d = p.детекторы;
  return (
    tr.кейсArticle === "нет" &&
    !tr.склейка &&
    !tr.синтетическийЗаголовок &&
    !tr.правкаДаты &&
    !tr.годЧужой &&
    tr.заменаПолноразмераПревью === 0 &&
    tr.windowOpenНеКартинка === 0 &&
    !tr.обаИсточникаФото &&
    tr.фотоДедупЛента + tr.фотоДедупArticle === 0 &&
    tr.фотоНеразрешеноЛента + tr.фотоНеразрешеноArticle === 0 &&
    !tr.параОдноимённых &&
    !tr.articleУтрачен &&
    Object.keys(p.источник.сумма.выброшенныеТеги).length === 0 &&
    p.источник.сумма.фотоРазметка.потерянныхImg === 0 &&
    !d.д1.любое &&
    !d.д2.любое &&
    d.д3.а !== true &&
    !d.д3.б &&
    d.д3.в.length === 0 &&
    !d.д4 &&
    !d.д5 &&
    (p.результат.бакетТело === "201–1000" || p.результат.бакетТело === "1001–4000")
  );
}

type ExtremeList = { id: string; заголовок: string; idxs: number[] };

/** Пятёрки крайних (при равенстве — порядок экспорта; сортировка стабильная). */
function buildExtremes(profs: ProfileRecord[]): ExtremeList[] {
  const idxAll = profs.map((_, i) => i);
  const top5 = (cmp: (a: number, b: number) => number) => [...idxAll].sort(cmp).slice(0, 5);
  const by = (f: (p: ProfileRecord) => number, desc: boolean) => (a: number, b: number) => {
    const d = desc ? f(profs[b]) - f(profs[a]) : f(profs[a]) - f(profs[b]);
    return d !== 0 ? d : a - b;
  };
  const byDate = (desc: boolean) => (a: number, b: number) => {
    const da = profs[a].ключ.датаISO;
    const db = profs[b].ключ.датаISO;
    if (da !== db) return desc ? (da < db ? 1 : -1) : da < db ? -1 : 1;
    return a - b;
  };
  const nonEmpty = idxAll.filter((i) => profs[i].результат.длинаPlainТела > 0);
  return [
    { id: "крайняя:самые старые", заголовок: "5 самых старых", idxs: top5(byDate(false)) },
    { id: "крайняя:самые новые", заголовок: "5 самых новых", idxs: top5(byDate(true)) },
    {
      id: "крайняя:самые длинные",
      заголовок: "5 самых длинных по plain-телу",
      idxs: top5(by((p) => p.результат.длинаPlainТела, true)),
    },
    {
      id: "крайняя:самые короткие непустые",
      заголовок: "5 самых коротких непустых",
      idxs: [...nonEmpty].sort(by((p) => p.результат.длинаPlainТела, false)).slice(0, 5),
    },
    {
      id: "крайняя:максимум фото",
      заголовок: "5 с наибольшим числом фото",
      idxs: top5(by((p) => p.результат.фотоВсего, true)),
    },
    {
      id: "крайняя:максимум документов",
      заголовок: "5 с наибольшим числом документов",
      idxs: top5(by((p) => p.результат.документов, true)),
    },
    {
      id: "крайняя:максимум ссылок",
      заголовок: "5 с наибольшим числом ссылок в теле",
      idxs: top5(by((p) => p.результат.ссылокВТеле, true)),
    },
  ];
}

type SampleEntry = { idx: number; причины: string[] };

function selectSample(
  profs: ProfileRecord[],
  extremes: ExtremeList[],
): { entries: SampleEntry[]; goalStats: Array<{ id: string; популяция: number }> } {
  const causes = new Map<number, string[]>();
  const addCause = (idx: number, cause: string) => {
    const arr = causes.get(idx) ?? [];
    if (!arr.includes(cause)) arr.push(cause);
    causes.set(idx, arr);
  };

  // 1) Жадное покрытие целей: каждая цель — 2 записи (или 1, если популяция 1).
  const goals = buildGoals(profs);
  const goalStats: Array<{ id: string; популяция: number }> = [];
  const active = goals
    .map((g) => {
      const популяция = profs.filter(g.pred).length;
      goalStats.push({ id: g.id, популяция });
      return { ...g, need: Math.min(2, популяция) };
    })
    .filter((g) => g.need > 0);
  const selected = new Set<number>();
  for (;;) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < profs.length; i++) {
      if (selected.has(i)) continue;
      let score = 0;
      for (const g of active) if (g.need > 0 && g.pred(profs[i])) score += 1;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    selected.add(bestIdx);
    for (const g of active) {
      if (g.need > 0 && g.pred(profs[bestIdx])) {
        g.need -= 1;
        addCause(bestIdx, g.id);
      }
    }
    if (!active.some((g) => g.need > 0)) break;
  }

  // 2) Крайние: первая и последняя из каждой пятёрки.
  for (const ex of extremes) {
    if (ex.idxs.length === 0) continue;
    addCause(ex.idxs[0], ex.id);
    addCause(ex.idxs[ex.idxs.length - 1], ex.id);
  }

  // 3) 8 «обычных»: mulberry32 seed 8 из списка, отсортированного по ключу файл|№.
  const ordinary = profs
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => isOrdinary(p))
    .sort((a, b) => {
      const fa = FEED_FILES.indexOf(a.p.ключ.файл);
      const fb = FEED_FILES.indexOf(b.p.ключ.файл);
      if (fa !== fb) return fa - fb;
      return a.p.ключ.номер - b.p.ключ.номер;
    });
  const rand = mulberry32(8);
  const pool = [...ordinary];
  for (let k = 0; k < 8 && pool.length > 0; k++) {
    const at = Math.floor(rand() * pool.length);
    const picked = pool.splice(at, 1)[0];
    addCause(picked.i, "обычная");
  }

  const entries: SampleEntry[] = [...causes.entries()]
    .map(([idx, причины]) => ({ idx, причины }))
    .sort((a, b) => a.idx - b.idx);
  return { entries, goalStats };
}

const CAUSE_ORDER_FIXED = ["д1", "д2", "д3а", "д3б", "д3в", "д3г", "д4", "д5"];

function causeRank(c: string): number {
  const i = CAUSE_ORDER_FIXED.indexOf(c);
  if (i >= 0) return i;
  if (c.startsWith("крайняя:")) return 100;
  if (c === "обычная") return 300;
  return 200;
}

function mainCause(причины: string[]): string {
  return [...причины].sort((a, b) => causeRank(a) - causeRank(b) || (a < b ? -1 : 1))[0];
}

// ───────────────────────── профиль: рендеринг и запись ─────────────────────────

const mdEsc = (s: string): string => s.replace(/\|/g, "\\|");

const profKeyStr = (p: ProfileRecord): string =>
  `${p.ключ.файл}#${p.ключ.номер} ${p.ключ.дата} «${p.ключ.заголовок}»`;

/** Таблица «значение → число записей» с заданным порядком значений. */
function tallyTable(
  L: string[],
  title: string,
  profs: ProfileRecord[],
  f: (p: ProfileRecord) => string,
  order?: string[],
): void {
  const counts = new Map<string, number>();
  for (const p of profs) {
    const v = f(p);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const keys = order
    ? [
        ...order.filter((k) => counts.has(k)),
        ...[...counts.keys()].filter((k) => order.indexOf(k) === -1).sort(),
      ]
    : [...counts.keys()].sort();
  L.push(`### ${title}`);
  L.push("");
  L.push("| значение | записей |");
  L.push("|---|---|");
  for (const k of keys) L.push(`| ${mdEsc(k)} | ${counts.get(k)} |`);
  L.push("");
}

/** Счётчик: распределение 0/1/2/3+ по записям плюс сумма вхождений. */
function counterTable(
  L: string[],
  title: string,
  profs: ProfileRecord[],
  f: (p: ProfileRecord) => number,
): void {
  tallyTable(
    L,
    `${title} (сумма вхождений: ${profs.reduce((s, p) => s + f(p), 0)})`,
    profs,
    (p) => {
      const n = f(p);
      return n <= 2 ? String(n) : "3+";
    },
    ["0", "1", "2", "3+"],
  );
}

function flagTable(
  L: string[],
  title: string,
  profs: ProfileRecord[],
  f: (p: ProfileRecord) => boolean,
): void {
  tallyTable(L, title, profs, (p) => (f(p) ? "да" : "нет"), ["да", "нет"]);
}

function srcScopeSection(
  L: string[],
  scope: string,
  profs: ProfileRecord[],
  f: (p: ProfileRecord) => SrcFeatures | null,
): void {
  const have = profs.filter((p) => f(p) !== null);
  const g = (p: ProfileRecord) => f(p)!;
  L.push(`## Признаки источника: ${scope} (записей: ${have.length})`);
  L.push("");
  if (have.length === 0) {
    L.push("_нет_");
    L.push("");
    return;
  }
  // Выброшенные теги: имя → записей с тегом, всего вхождений.
  const tagRecs = new Map<string, number>();
  const tagTotal = new Map<string, number>();
  for (const p of have) {
    for (const [k, v] of Object.entries(g(p).выброшенныеТеги)) {
      tagRecs.set(k, (tagRecs.get(k) ?? 0) + 1);
      tagTotal.set(k, (tagTotal.get(k) ?? 0) + v);
    }
  }
  L.push("### Выброшенные санитайзером теги");
  L.push("");
  L.push("| тег | записей | вхождений |");
  L.push("|---|---|---|");
  for (const k of [...tagRecs.keys()].sort()) {
    L.push(`| ${k} | ${tagRecs.get(k)} | ${tagTotal.get(k)} |`);
  }
  if (tagRecs.size === 0) L.push("| _нет_ | | |");
  L.push("");
  tallyTable(
    L,
    "Таблицы: класс",
    have,
    (p) => {
      const t = g(p).таблицы;
      if (t.всего === 0) return "нет таблиц";
      if (t.данных > 0 && t.вёрстки > 0) return "данных и вёрстки";
      return t.данных > 0 ? "только данных" : "только вёрстки";
    },
    ["нет таблиц", "только вёрстки", "только данных", "данных и вёрстки"],
  );
  counterTable(L, "center-теги", have, (p) => g(p).выравнивание.center);
  counterTable(L, "align=center", have, (p) => g(p).выравнивание.alignCenter);
  counterTable(L, "атрибуты style", have, (p) => g(p).выравнивание.style);
  counterTable(L, "атрибуты color", have, (p) => g(p).выравнивание.color);
  counterTable(L, "font color", have, (p) => g(p).выравнивание.fontColor);
  counterTable(L, "распознанные пары фото", have, (p) => g(p).фотоРазметка.пар);
  counterTable(L, "потерянные img (вне пары)", have, (p) => g(p).фотоРазметка.потерянныхImg);
  counterTable(L, "пары с alt", have, (p) => g(p).фотоРазметка.alt);
  counterTable(L, "пары с title", have, (p) => g(p).фотоРазметка.title);
  counterTable(L, "ссылки внешние", have, (p) => g(p).ссылки.внешние);
  counterTable(L, "ссылки внутренние легаси", have, (p) => g(p).ссылки.внутренние);
  counterTable(L, "ссылки mailto", have, (p) => g(p).ссылки.mailto);
  counterTable(L, "ссылки-вложения (заменены текстом)", have, (p) => g(p).ссылки.вложенияТекстом);
  counterTable(L, "ссылки неразрешённые", have, (p) => g(p).ссылки.неразрешённые);
  flagTable(L, "моджибейк: U+FFFD", have, (p) => g(p).моджибейк.fffd);
  flagTable(L, "моджибейк: Ã/Â/Ð/Ñ/â€", have, (p) => g(p).моджибейк.latin1);
  flagTable(L, "моджибейк: ≥3 «?» подряд", have, (p) => g(p).моджибейк.вопросы);
  flagTable(L, "моджибейк: чередование Р/С", have, (p) => g(p).моджибейк.чередованиеРС);
  tallyTable(L, "Длина plain (бакеты)", have, (p) => bodyBucket(g(p).длинаPlain), [
    "0",
    "1–200",
    "201–1000",
    "1001–4000",
    "4000+",
  ]);
}

function detectorSection(
  L: string[],
  title: string,
  profs: ProfileRecord[],
  f: (p: ProfileRecord) => boolean,
): number {
  const hits = profs.filter(f);
  L.push(`### ${title}: ${hits.length}`);
  L.push("");
  for (const p of hits.slice(0, 10)) L.push(`- ${profKeyStr(p)}`);
  if (hits.length === 0) L.push("_нет_");
  L.push("");
  return hits.length;
}

function renderProfileReport(
  profs: ProfileRecord[],
  extremes: ExtremeList[],
  sampleSize: number,
  d3aCalibration: number,
): string {
  const L: string[] = [];
  L.push("# profile-report — профиль экспорта архива (этап 8, --profile)");
  L.push("");
  L.push(`Записей в экспорте: ${profs.length}.`);
  L.push("");
  L.push("## Гистограмма по годам");
  L.push("");
  L.push("| год | записей |");
  L.push("|---|---|");
  const byYear = new Map<string, number>();
  for (const p of profs) {
    const y = p.ключ.датаISO.slice(0, 4);
    byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  for (const y of [...byYear.keys()].sort()) L.push(`| ${y} | ${byYear.get(y)} |`);
  L.push("");

  L.push("## Признаки результата");
  L.push("");
  tallyTable(L, "Бакет plain-тела", profs, (p) => p.результат.бакетТело, [
    "0",
    "1–200",
    "201–1000",
    "1001–4000",
    "4000+",
  ]);
  tallyTable(L, "Бакет фото (обложка + галерея)", profs, (p) => p.результат.бакетФото, [
    "0",
    "1",
    "2–5",
    "6–20",
    "21–50",
    "51+",
  ]);
  tallyTable(L, "Бакет документов", profs, (p) => p.результат.бакетДокументы, ["0", "1", "2+"]);
  tallyTable(L, "Бакет ссылок в теле", profs, (p) => p.результат.бакетСсылки, ["0", "1–3", "4+"]);
  tallyTable(L, "Бакет года", profs, (p) => p.результат.бакетГод, [
    "2004–2005",
    "2006–2009",
    "2010–2014",
    "2015–2019",
    "2020–2026",
  ]);
  flagTable(L, "Анонс есть", profs, (p) => p.результат.естьАнонс);
  tallyTable(
    L,
    "Длина заголовка",
    profs,
    (p) => {
      const n = p.результат.длинаЗаголовка;
      return n <= 40 ? "1–40" : n <= 80 ? "41–80" : "81+";
    },
    ["1–40", "41–80", "81+"],
  );
  counterTable(
    L,
    "Псевдозаголовки (абзац целиком в b/strong)",
    profs,
    (p) => p.результат.псевдоЗаголовки,
  );
  counterTable(
    L,
    "Псевдосписки (≥2 абзацев-пунктов подряд)",
    profs,
    (p) => p.результат.псевдоСписки,
  );
  counterTable(L, "Пустые <p></p>", profs, (p) => p.результат.пустыхP);
  counterTable(L, "≥3 <br> подряд", profs, (p) => p.результат.br3Подряд);
  counterTable(L, "≥3 &nbsp; подряд", profs, (p) => p.результат.nbsp3Подряд);

  L.push("## Признаки трансформации");
  L.push("");
  tallyTable(L, "Схема ленты", profs, (p) => p.трансформация.схемаЛенты, ["A", "B", "C"]);
  tallyTable(L, "Схема article", profs, (p) => p.трансформация.схемаArticle ?? "—", [
    "C",
    "D",
    "—",
  ]);
  tallyTable(L, "Кейс article", profs, (p) => p.трансформация.кейсArticle, [
    "нет",
    "цитата",
    "тизер",
    "галерея",
    "утрачена",
  ]);
  flagTable(L, "Склейка", profs, (p) => p.трансформация.склейка);
  flagTable(L, "Синтетический заголовок", profs, (p) => p.трансформация.синтетическийЗаголовок);
  flagTable(L, "Правка даты", profs, (p) => p.трансформация.правкаДаты);
  flagTable(L, "Год ≠ году файла", profs, (p) => p.трансформация.годЧужой);
  flagTable(L, "Оба источника фото непусты", profs, (p) => p.трансформация.обаИсточникаФото);
  flagTable(
    L,
    "Участник пары одноимённых с разными телами",
    profs,
    (p) => p.трансформация.параОдноимённых,
  );
  flagTable(L, "Article утрачен на сервере", profs, (p) => p.трансформация.articleУтрачен);
  counterTable(
    L,
    "Замена полноразмера превью",
    profs,
    (p) => p.трансформация.заменаПолноразмераПревью,
  );
  counterTable(L, "window.open на не-картинку", profs, (p) => p.трансформация.windowOpenНеКартинка);
  counterTable(L, "Фото из ленты (взято)", profs, (p) => p.трансформация.фотоИзЛенты);
  counterTable(L, "Фото из article (взято)", profs, (p) => p.трансформация.фотоИзArticle);
  counterTable(
    L,
    "Фото выпало дедупликацией по пути",
    profs,
    (p) => p.трансформация.фотоДедупЛента + p.трансформация.фотоДедупArticle,
  );
  counterTable(
    L,
    "Фото не разрешено",
    profs,
    (p) => p.трансформация.фотоНеразрешеноЛента + p.трансформация.фотоНеразрешеноArticle,
  );
  counterTable(L, "Документы", profs, (p) => p.трансформация.документы);
  const extCounts = new Map<string, number>();
  for (const p of profs) {
    for (const e of p.трансформация.расширенияДокументов)
      extCounts.set(e, (extCounts.get(e) ?? 0) + 1);
  }
  L.push("### Расширения документов (записей с расширением)");
  L.push("");
  L.push("| расширение | записей |");
  L.push("|---|---|");
  for (const e of [...extCounts.keys()].sort()) L.push(`| ${e} | ${extCounts.get(e)} |`);
  if (extCounts.size === 0) L.push("| _нет_ | |");
  L.push("");

  srcScopeSection(L, "лента", profs, (p) => p.источник.лента);
  srcScopeSection(L, "article", profs, (p) => p.источник.article);
  srcScopeSection(L, "сумма", profs, (p) => p.источник.сумма);

  L.push("## Детекторы известных дефектов");
  L.push("");
  detectorSection(L, "д1 — HTML-сущности в плоских полях", profs, (p) => p.детекторы.д1.любое);
  detectorSection(L, "д1: в заголовке", profs, (p) => p.детекторы.д1.заголовок);
  detectorSection(L, "д1: в анонсе", profs, (p) => p.детекторы.д1.анонс);
  detectorSection(L, "д1: в документах", profs, (p) => p.детекторы.д1.документы);
  detectorSection(L, "д2 — обрывки Dreamweaver-комментариев", profs, (p) => p.детекторы.д2.любое);
  detectorSection(L, "д2: в теле", profs, (p) => p.детекторы.д2.тело);
  detectorSection(L, "д2: в плоских полях", profs, (p) => p.детекторы.д2.поля);
  detectorSection(
    L,
    "д3 — задвоенное тело (хотя бы один сигнал)",
    profs,
    (p) => p.детекторы.д3.любое,
  );
  detectorSection(
    L,
    "д3(а) — тело ≠ санитизированной ленте и article",
    profs,
    (p) => p.детекторы.д3.а === true,
  );
  detectorSection(L, "д3(б) — дубль-подстрока ≥120 символов", profs, (p) => p.детекторы.д3.б);
  detectorSection(
    L,
    "д3(в) — фраза-триггер тизера в теле",
    profs,
    (p) => p.детекторы.д3.в.length > 0,
  );
  for (const trig of D3V_TRIGGERS) {
    L.push(
      `- д3(в) вариант «${trig.id}»: ${profs.filter((p) => p.детекторы.д3.в.includes(trig.id)).length}`,
    );
  }
  L.push("");
  detectorSection(
    L,
    "д3(г) — анонс задвоен в теле (общая подстрока ≥120)",
    profs,
    (p) => p.детекторы.д3.г === true,
  );
  L.push(`Склеек, исключённых из д3(а): ${profs.filter((p) => p.детекторы.д3.а === null).length}.`);
  L.push("");
  L.push(
    `**Калибровка: д3(а) у записей без article/склейки: ${d3aCalibration}** (обязан быть 0; не 0 — ошибка профильного вызова санитайзера, не дефект данных).`,
  );
  L.push("");
  detectorSection(L, "д4 — plain-тело пустое или короче 30", profs, (p) => p.детекторы.д4);
  detectorSection(L, "д5 — plain(тело) = plain(Анонс)", profs, (p) => p.детекторы.д5);

  L.push("## Крайние");
  L.push("");
  for (const ex of extremes) {
    L.push(`### ${ex.заголовок}`);
    L.push("");
    for (const i of ex.idxs) L.push(`- ${profKeyStr(profs[i])}`);
    L.push("");
  }

  L.push(`## Выборка`);
  L.push("");
  L.push(`Размер выборки для проверки глазами (sample.md): ${sampleSize}.`);
  L.push("");
  return L.join("\n") + "\n";
}

function renderSample(profs: ProfileRecord[], entries: SampleEntry[]): string {
  const L: string[] = [];
  L.push("# sample — детерминированная выборка для проверки глазами (этап 8, --profile)");
  L.push("");
  const groups = new Map<string, SampleEntry[]>();
  for (const e of entries) {
    const главная = mainCause(e.причины);
    const arr = groups.get(главная) ?? [];
    arr.push(e);
    groups.set(главная, arr);
  }
  const groupKeys = [...groups.keys()].sort(
    (a, b) => causeRank(a) - causeRank(b) || (a < b ? -1 : 1),
  );
  for (const gk of groupKeys) {
    L.push(`## ${gk}`);
    L.push("");
    L.push(
      "| Дата дд.мм.гггг | ISO | Файл ленты | № в файле | Заголовок | Путь article | Причины отбора |",
    );
    L.push("|---|---|---|---|---|---|---|");
    for (const e of groups.get(gk)!) {
      const p = profs[e.idx];
      const причины = [...e.причины].sort(
        (a, b) => causeRank(a) - causeRank(b) || (a < b ? -1 : 1),
      );
      L.push(
        `| ${p.ключ.дата} | ${p.ключ.датаISO} | ${p.ключ.файл} | ${p.ключ.номер} | ${mdEsc(p.ключ.заголовок)} | ${p.ключ.article ? mdEsc(p.ключ.article) : "—"} | ${mdEsc(причины.join("; "))} |`,
      );
    }
    L.push("");
  }
  L.push(`Размер выборки: ${entries.length}.`);
  L.push("");
  return L.join("\n") + "\n";
}

/** Точка входа профиля: вызывается из main после записи экспортных файлов. */
function runProfile(records: OutputRecord[]): void {
  // Участники пар одноимённых с разными телами — post-hoc, как в dedupeRecords.
  const norm = (t: string) => t.trim().replace(/\s+/g, " ");
  const tdGroups = new Map<string, number>();
  for (const rec of records) {
    const key = `${norm(rec["Заголовок"])}|${rec["Дата"]}`;
    tdGroups.set(key, (tdGroups.get(key) ?? 0) + 1);
  }

  const profs: ProfileRecord[] = records.map((rec) => {
    const cap = profByRecord.get(rec);
    if (!cap)
      throw new Error(`профиль: нет capture для записи «${rec["Заголовок"]}» (${rec["Дата"]})`);
    const пара = (tdGroups.get(`${norm(rec["Заголовок"])}|${rec["Дата"]}`) ?? 0) > 1;
    return buildProfileRecord(rec, cap, пара);
  });

  // Калибровка д3(а): у записей без article и без склейки обязан быть 0.
  const d3aCalibration = profs.filter(
    (p) =>
      p.детекторы.д3.а === true &&
      p.трансформация.кейсArticle === "нет" &&
      !p.трансформация.склейка,
  ).length;

  const extremes = buildExtremes(profs);
  const { entries } = selectSample(profs, extremes);

  mkdirSync(PROFILE_DIR, { recursive: true });
  const json = JSON.stringify(profs, null, 2) + "\n";
  writeFileSync(join(PROFILE_DIR, "profile.json"), json, "utf-8");
  writeFileSync(
    join(PROFILE_DIR, "profile-report.md"),
    renderProfileReport(profs, extremes, entries.length, d3aCalibration),
    "utf-8",
  );
  writeFileSync(join(PROFILE_DIR, "sample.md"), renderSample(profs, entries), "utf-8");

  console.log(`Профиль: ${join(PROFILE_DIR, "profile.json")} (${json.length} байт)`);
  console.log(`Профиль-отчёт: ${join(PROFILE_DIR, "profile-report.md")}`);
  console.log(`Выборка: ${join(PROFILE_DIR, "sample.md")} (записей: ${entries.length})`);
  console.log(`Калибровка д3(а) без article/склейки: ${d3aCalibration}`);

  // Контроль детектора д3 по подстроке заголовка (--profile-control) — после
  // записи файлов, чтобы при провале артефакты оставались для разбора.
  if (PROFILE_CONTROL) {
    const matches = profs.filter((p) => p.ключ.заголовок.includes(PROFILE_CONTROL));
    if (matches.length === 0) {
      console.error("контроль: записей не найдено");
      process.exit(1);
    }
    let failed = false;
    for (const p of matches) {
      const d3 = p.детекторы.д3;
      const signals =
        `а=${d3.а === null ? "исключена (склейка)" : d3.а} б=${d3.б} ` +
        `в=[${d3.в.join(", ")}] г=${d3.г === null ? "нет анонса" : d3.г}`;
      console.log(`контроль: ${profKeyStr(p)} — д3: ${signals}`);
      if (!d3.любое) {
        console.error(`контроль: ${profKeyStr(p)} — ни один сигнал д3 не сработал`);
        failed = true;
      }
    }
    if (failed) process.exit(1);
  }
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

  // ── кейсы профиля (--profile): чистые функции анализа на буквальном входе ──
  const silentCtx: SanitizeCtx = { baseUrl: `${SITE}/news.html`, silent: true };
  const sentA =
    "Праздничная тренировка группы прошла в манеже на Крестовском острове при участии " +
    "воспитанников школы, их родителей и тренерского состава федерации тенниса города";
  const sentB =
    "Полный отчёт о мероприятии с фотографиями и списком участников опубликован на сайте.";
  const feedHtml = `<p>${sentA}</p>`;
  const articleHtml = `<p>${sentA} ${sentB}</p>`;
  const tableInput =
    "<table><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td><td>6</td></tr>" +
    "<tr><td>7</td><td>8</td><td>9</td></tr></table>";
  const imgInput = `<p><img src="news/2010/foto.jpg"></p>`;
  const d1Input = "Итоги сезона&hellip;";

  const dupBody = sanitizeBody(feedHtml + articleHtml, silentCtx);
  const dupPlain = plainProf(dupBody);
  const sanFeedPlain = plainProf(sanitizeBody(feedHtml, silentCtx));
  const sanArtPlain = plainProf(sanitizeBody(articleHtml, silentCtx));
  const d3a = dupPlain !== sanFeedPlain && dupPlain !== sanArtPlain;
  const d3b = profHasDup120(dupPlain);

  const profCases: Array<{ name: string; input: string; output: string; ok: boolean }> = [
    (() => {
      const out = profAnalyzeTables(tableInput);
      return {
        name: "профиль: таблица 3×3 с числами → «таблица данных»",
        input: tableInput,
        output: JSON.stringify(out),
        ok: out.данных === 1 && out.вёрстки === 0 && out.макс === "3×3",
      };
    })(),
    (() => {
      const out = profPhotoMarkup(imgInput);
      return {
        name: "профиль: img вне пары → потерянный img = 1",
        input: imgInput,
        output: JSON.stringify(out),
        ok: out.потерянныхImg === 1 && out.пар === 0,
      };
    })(),
    {
      name: "профиль: тело = лента + article → д3(а) и д3(б)",
      input: feedHtml + articleHtml,
      output: `д3(а)=${d3a} д3(б)=${d3b} (длина повторяемой фразы: ${sentA.length})`,
      ok: d3a && d3b && sentA.length >= 121,
    },
    {
      name: "профиль: «&hellip;» в заголовке → д1",
      input: d1Input,
      output: String(D1_RE.test(d1Input)),
      ok: D1_RE.test(d1Input),
    },
    (() => {
      // Анонс = тизер, тело начинается с того же текста (кейс Игнатовой).
      const anons = sentA;
      const bodyPlain = plainProf(sanitizeBody(`<p>${sentA} ${sentB}</p>`, silentCtx));
      const out = profHasCommonRun120(plainProf(anons), bodyPlain);
      return {
        name: "профиль: анонс повторён в начале тела → д3(г)",
        input: `Анонс: ${anons} | Тело: ${sentA} ${sentB}`,
        output: String(out),
        ok: out,
      };
    })(),
  ];
  for (const c of profCases) {
    if (!c.ok) failed += 1;
    console.log(`[${c.ok ? "OK" : "FAIL"}] ${c.name}`);
    console.log(`  вход:  ${c.input}`);
    console.log(`  выход: ${c.output}`);
  }

  const total = cases.length + profCases.length;
  console.log(`\nСамотест: ${total - failed}/${total} прошло`);
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

  if (PROFILING) runProfile(records);
}

main();
