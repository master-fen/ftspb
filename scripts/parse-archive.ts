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
 *   Инвентаризация перед миграцией (19.09.2026): смежные ленты
 *   (plt_news/pobeda/festvest/150), детекторы д6–д8, признаки одиночных
 *   картинок, примерка правила анонса (excerpt-preview.md в той же папке),
 *   заголовки, записи 2026 года, сводка по годам и раздел «Контроли» —
 *   любой контроль с вердиктом НЕТ даёт exit 1 после записи файлов.
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
  /** Тизерные страницы схемы D, у которых шапка срезана. */
  headerCut: number;
  /** Вместе с шапкой срезан повтор заголовка сразу после строки публикации. */
  headerRepeatCut: string[];
  /** Схема D, шапка не распознана — тело оставлено целиком. */
  headerNotCut: string[];
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
  headerCut: 0,
  headerRepeatCut: [],
  headerNotCut: [],
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
  absorbed: Array<{
    relFile: string;
    url: string;
    bodyHtml: string;
    layout: "C" | "D" | null;
    /** Дата страницы, по которой боевой путь считал правило 60 дней (ArticlePage.date). */
    date: string | null;
  }>;
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

/**
 * Комментарии → пробелы той же длины: позиции и номера строк не плывут.
 * Осиротевший `-->` без парного `<!--` (опечатка легаси в newsarch_2017.html;
 * браузер показывал его буквально) после основной замены комментарию
 * принадлежать не может — тоже затирается.
 */
function blankComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " ")).replace(/-->/g, "   ");
}

/** Именованные сущности, которые декодируются в плоских полях (заголовок, анонс) и в профиле. */
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
  ouml: "ö",
};

/**
 * Переопределение HTML5 для числовых ссылок 128–159: браузер отдаёт символы
 * cp1252 (`&#149;` → «•»), а не управляющие C1.
 */
const C1_OVERRIDES: Record<number, string> = {
  128: "€",
  130: "‚",
  131: "ƒ",
  132: "„",
  133: "…",
  134: "†",
  135: "‡",
  136: "ˆ",
  137: "‰",
  138: "Š",
  139: "‹",
  140: "Œ",
  142: "Ž",
  145: "‘",
  146: "’",
  147: "“",
  148: "”",
  149: "•",
  150: "–",
  151: "—",
  152: "˜",
  153: "™",
  154: "š",
  155: "›",
  156: "œ",
  158: "ž",
  159: "Ÿ",
};

function safeCodePoint(cp: number): string {
  const c1 = C1_OVERRIDES[cp];
  if (c1 !== undefined) return c1;
  if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff)) return "�";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "�";
  }
}

/**
 * Одна сущность: числовая (`&#149`, `&#x2026`) или именованная, с `;` либо
 * без неё — без `;` только если дальше не буква и не цифра.
 */
const ENTITY_RE = /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*)(;|(?![a-zA-Z0-9;]))/g;

/** Имя сущности (без `&`) известно: числовое либо есть в словаре (регистр точный). */
const isKnownEntity = (name: string): boolean =>
  name[0] === "#" || NAMED_ENTITIES[name] !== undefined;

/**
 * Декодирование сущностей в плоском тексте. Обе формы — с `;` и без неё
 * (лента старого сайта могла обрезать анонс на сущности): имя без `;`
 * декодируется, только если оно есть в словаре и за ним не буква и не цифра
 * («&hellipsis», «P&G», «&foo» не трогаются); тот же порядок для числовых.
 * Один проход: «&amp;hellip;» даёт «&hellip;» и повторно не декодируется.
 */
function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (whole: string, name: string) => {
    if (name[0] === "#") {
      const cp = /^#[xX]/.test(name) ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(cp) ? safeCodePoint(cp) : whole;
    }
    const known = NAMED_ENTITIES[name];
    return known !== undefined ? known : whole;
  });
}

function stripTags(html: string): string {
  // `<` не перед латинской буквой/`/`/`!` — не тег, а опечатка легаси
  // (`<Завершилось …` в заголовках 2016–2022 браузер рендерит как текст).
  return decodeEntities(html.replace(/<\/?[a-zA-Z!][^>]*>/g, " ").replace(/</g, " "))
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

type SanitizeCtx = {
  baseUrl: string;
  silent?: boolean;
  /** Видео-вставки (`<iframe src>`) становятся ссылкой «Видео» — только для тела записи, не для анонса. */
  videoLinks?: boolean;
};

// ───────────────────────── таблицы: разбор и признак «данных» ─────────────────────────

/** Ячейка «с числом»: plain непуст и целиком из цифр/пунктуации счёта. */
const NUMERIC_CELL_RE = /^[\d\s.,:;/()–-]+$/;
/** Доля числовых ячеек, начиная с которой таблица — «данных», а не вёрстки. */
const DATA_TABLE_RATIO = 0.3;

type TableInfo = {
  /** Индекс `<table` во фрагменте. */
  start: number;
  /** Индекс сразу после `</table>`; у незакрытой таблицы легаси — конец фрагмента. */
  end: number;
  /** 0 — верхний уровень. */
  depth: number;
  rows: number;
  cols: number;
  data: boolean;
  /** Таблиц непосредственно внутри. */
  nested: number;
};

/**
 * Таблицы фрагмента: границы, глубина, строки×столбцы и класс «данных/вёрстки»
 * по доле числовых ячеек ≥ DATA_TABLE_RATIO. Вложенность учитывается стеком:
 * текст вложенной таблицы не считается ячейкой внешней. Один признак и для
 * профиля (--profile), и для санитайзера — счёт и поведение не расходятся.
 */
function analyzeTables(html: string): TableInfo[] {
  type Frame = TableInfo & {
    cellsInRow: number;
    totalCells: number;
    numericCells: number;
    cellBuf: string;
    cellOpen: boolean;
  };
  const done: TableInfo[] = [];
  const stack: Frame[] = [];
  const closeCell = (f: Frame) => {
    if (!f.cellOpen) return;
    const t = stripTags(f.cellBuf);
    f.totalCells += 1;
    if (t !== "" && NUMERIC_CELL_RE.test(t)) f.numericCells += 1;
    f.cellOpen = false;
    f.cellBuf = "";
  };
  const endRow = (f: Frame) => {
    f.cols = Math.max(f.cols, f.cellsInRow);
    f.cellsInRow = 0;
  };
  const finish = (f: Frame, end: number) => {
    closeCell(f);
    endRow(f);
    done.push({
      start: f.start,
      end,
      depth: f.depth,
      rows: f.rows,
      cols: f.cols,
      data: f.totalCells > 0 && f.numericCells / f.totalCells >= DATA_TABLE_RATIO,
      nested: f.nested,
    });
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
        if (top) top.nested += 1;
        stack.push({
          start: m.index,
          end: -1,
          depth: stack.length,
          rows: 0,
          cols: 0,
          data: false,
          nested: 0,
          cellsInRow: 0,
          totalCells: 0,
          numericCells: 0,
          cellBuf: "",
          cellOpen: false,
        });
      } else {
        const f = stack.pop();
        if (f) finish(f, last);
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
  // Незакрытые <table> легаси — досчитываем как закрытые до конца фрагмента.
  while (stack.length) finish(stack.pop()!, html.length);
  return done.sort((a, b) => a.start - b.start);
}

// ───────────────────────── санитайзер: конвейер ─────────────────────────

/** Предобработка фрагмента перед разбором: опечатки `<`, script/style, фото-разметка, служебные фразы. */
function prepareHtml(html: string): string {
  return (
    html
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
      .replace(/Кликните на фото для увеличения/gi, " ")
  );
}

/**
 * Инлайн-конвейер: фрагмент → абзацы (без обёртки `<p>`) с белым списком
 * a[href], b/strong, i/em, `<br>`; границы блочных тегов (в том числе
 * ячеек и рядов таблиц) — разрывы абзацев, прочие теги выбрасываются.
 */
function inlineParagraphs(work: string, ctx: SanitizeCtx): string[] {
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
  return paras.map((p) => p[0]);
}

/** Атрибуты ячейки, которые принимает сайт: colspan/rowspan с целым больше единицы. */
function spanAttrs(tag: string): string {
  let out = "";
  for (const m of tag.matchAll(/\b(colspan|rowspan)\s*=\s*["']?(\d+)/gi)) {
    if (Number(m[2]) > 1) out += ` ${m[1].toLowerCase()}="${Number(m[2])}"`;
  }
  return out;
}

/**
 * Таблица данных → разметка из тегов, которые принимает сайт
 * (src/server/sanitize.ts): table, caption, thead, tbody, tfoot, tr, th, td;
 * у ячеек — только colspan/rowspan. Содержимое ячейки и подписи — тем же
 * инлайн-конвейером, блочные границы внутри ячейки — `<br>`. Незакрытые
 * структурные теги закрываются в конце.
 */
function sanitizeTable(tableHtml: string, ctx: SanitizeCtx): string {
  const out: string[] = [];
  const open: string[] = [];
  let cell: { tag: string; attrs: string; from: number } | null = null;
  const closeCell = (to: number) => {
    if (!cell) return;
    const inner = inlineParagraphs(tableHtml.slice(cell.from, to), ctx).join("<br>");
    out.push(`<${cell.tag}${cell.attrs}>${inner}</${cell.tag}>`);
    cell = null;
  };
  const closeTo = (tag: string) => {
    const idx = open.lastIndexOf(tag);
    if (idx === -1) return;
    while (open.length > idx) out.push(`</${open.pop()}>`);
  };
  const tagRe = /<(\/?)(table|caption|thead|tbody|tfoot|tr|th|td)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(tableHtml))) {
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    closeCell(m.index);
    if (tag === "td" || tag === "th" || tag === "caption") {
      if (!closing) {
        cell = {
          tag,
          attrs: tag === "caption" ? "" : spanAttrs(m[0]),
          from: m.index + m[0].length,
        };
      }
      continue;
    }
    if (closing) {
      closeTo(tag);
    } else {
      out.push(`<${tag}>`);
      open.push(tag);
    }
  }
  closeCell(tableHtml.length);
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("");
}

/**
 * Тело новости → блоки: абзацы `<p>` (белый список a[href], b/strong, i/em,
 * `<br>`) и таблицы данных. Фрагмент режется по границам таблиц данных без
 * вложенных таблиц (analyzeTables — тот же признак, что считает профиль);
 * куски между ними идут инлайн-конвейером, где макетные таблицы и таблицы
 * данных с вложенными разворачиваются в абзацы (границы ячеек/рядов —
 * разрывы). Таблица данных внутри макетной остаётся таблицей: внешняя
 * разворачивается вокруг неё. script/style, on*-атрибуты и inline-стили
 * удаляются, фото-разметка и служебные фразы изъяты до разбора. В href
 * допускаются только http/https/mailto: прочие протоколы (javascript:,
 * data:, vbscript:) и неабсолютизируемые ссылки заменяются текстом ссылки.
 */
function sanitizeBody(html: string, ctx: SanitizeCtx): string {
  const work = prepareHtml(html);
  const blocks: string[] = [];
  const pushParas = (fragment: string) => {
    for (const p of inlineParagraphs(fragment, ctx)) blocks.push(`<p>${p}</p>`);
  };
  let pos = 0;
  for (const t of analyzeTables(work)) {
    if (!t.data || t.nested > 0 || t.start < pos) continue;
    pushParas(work.slice(pos, t.start));
    blocks.push(sanitizeTable(work.slice(t.start, t.end), ctx));
    pos = t.end;
  }
  pushParas(work.slice(pos));
  return blocks.join("\n");
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
  /** Схема D: шапка страницы срезана из bodyHtml (cutArticleHeader). */
  headerCut: boolean;
  /** Вместе с шапкой срезан повтор заголовка сразу после строки публикации. */
  repeatCut: boolean;
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
 * Регион содержимого article-страницы по маркерам Dreamweaver. Маркеры лежат
 * внутри комментариев `<!-- InstanceBeginEditable name="Edit02" -->` и
 * `<!-- InstanceEndEditable -->`; регион — между комментариями целиком.
 * Срез от индекса самого маркера оставлял хвост ` -->` открывающего
 * комментария текстом в начале тела (д2 у 56 тизерных записей) и голову
 * `<!-- ` закрывающего — в конце. Без маркеров — правая колонка от
 * `<td width="821"` до конца файла.
 */
function articleRegion(raw: string): string {
  const beginMark = raw.indexOf('InstanceBeginEditable name="Edit02"');
  const endMark = beginMark >= 0 ? raw.indexOf("InstanceEndEditable", beginMark) : -1;
  if (beginMark < 0 || endMark <= beginMark) {
    return raw.slice(Math.max(raw.indexOf('<td width="821"'), 0));
  }
  const beginClose = raw.indexOf("-->", beginMark);
  const start = beginClose >= 0 && beginClose < endMark ? beginClose + 3 : beginMark;
  const endOpen = raw.lastIndexOf("<!--", endMark);
  const end = endOpen >= start ? endOpen : endMark;
  return raw.slice(start, end);
}

/** Нормализация для сравнения текстов: нижний регистр, ё→е, всё кроме букв и цифр — один пробел. */
function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Строка публикации в шапке article-страницы: «Опубликовано»/«Обновлено»,
 * затем дата словом («30 августа 2023 г.», «25 сентября 2019 года») либо
 * цифрами («20.03.2022»); между ними — пробелы, `<br>`, `<i>`.
 */
const PUBLISHED_LINE_RE =
  /(?:Опубликовано|Обновлено)(?:\s|<br\s*\/?>|<\/?i>)*(?:\d{1,2}\s+[а-яё]+\s+\d{4}|\d{1,2}\.\d{2}\.\d{4})/i;
/** Сколько первых абзацев региона просматривается в поисках строки публикации. */
const HEADER_MAX_PARAS = 4;
/** Стоп задания: тело тизера после срезки шапки короче этого — срезано лишнее. */
const HEADER_CUT_MIN_BODY = 200;

type HeaderCut = { html: string; cut: boolean; repeat: boolean };

/**
 * Шапка article-страницы схемы D — по данным всех 56 тизерных страниц:
 * `<p class="Header_BlueBack">` с баннером-marquee → `<p>` с заголовком
 * страницы (незакрытый, бывают `<h1>`, `<b>`) → `<p>` со строкой публикации.
 * Шапка — регион до начала абзаца, следующего за строкой публикации; если
 * этот абзац слово в слово повторяет заголовок страницы (повтор-лид у двух
 * страниц 2023 года), он тоже срезается (`repeat`). Сторожа: первый абзац —
 * баннер, в шапке нет `<img` и `<table`, строка публикации — среди первых
 * HEADER_MAX_PARAS абзацев; иначе регион не режется (`cut: false`).
 */
function cutArticleHeader(regionHtml: string): HeaderCut {
  const none: HeaderCut = { html: regionHtml, cut: false, repeat: false };
  const starts = [...regionHtml.matchAll(/<p\b[^>]*>/gi)].map((m) => m.index);
  if (starts.length < 2) return none;
  const segment = (i: number): string =>
    regionHtml.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : regionHtml.length);
  if (!/^<p\b[^>]*class="Header_BlueBack"/i.test(segment(0))) return none;
  for (let i = 1; i < Math.min(starts.length, HEADER_MAX_PARAS); i++) {
    if (!PUBLISHED_LINE_RE.test(segment(i))) continue;
    let end = i + 1 < starts.length ? starts[i + 1] : regionHtml.length;
    if (/<img\b|<table\b/i.test(regionHtml.slice(0, end))) return none;
    let repeat = false;
    if (i + 1 < starts.length) {
      const titleText = normText(stripTags(regionHtml.slice(starts[1], starts[i])));
      const nextText = normText(stripTags(segment(i + 1)));
      if (titleText !== "" && nextText === titleText) {
        repeat = true;
        end = i + 2 < starts.length ? starts[i + 2] : regionHtml.length;
      }
    }
    return { html: regionHtml.slice(end), cut: true, repeat };
  }
  return none;
}

/**
 * Содержательная часть article-страницы: ряды ленточной таблицы (обёртка
 * схемы C), а если их нет (схема D) — правая колонка от маркера Edit02 до
 * футера без шапки (cutArticleHeader). Фото и объём (plainLength) — по
 * региону с шапкой: галереи и классификация тизер/галерея от срезки не
 * зависят.
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
      headerCut: false,
      repeatCut: false,
    };
    articleCache.set(relFile, page);
    return page;
  }

  // Регион контента ищем по маркерам-комментариям ДО их вычистки.
  const html = blankComments(articleRegion(raw));

  const chunks = splitChunks(html, relFile);
  let fullBody: string; // содержательная часть с шапкой — фото и объём
  let bodyHtml: string; // то, что идёт в тело записи
  let layout: "C" | "D";
  let headerCut = false;
  let repeatCut = false;
  if (chunks.some((c) => c.kind === "body")) {
    fullBody = chunks
      .filter((c) => c.kind === "body")
      .map((c) => c.cell)
      .join("\n");
    bodyHtml = fullBody;
    layout = "C";
  } else {
    fullBody = html;
    const cut = cutArticleHeader(html);
    bodyHtml = cut.html;
    headerCut = cut.cut;
    repeatCut = cut.repeat;
    layout = "D";
  }

  const page: ArticlePage = {
    relFile,
    url,
    bodyHtml,
    plainLength: stripTags(fullBody).length,
    photosHtml: fullBody,
    date: articleDate(html, relFile),
    lost: false,
    layout,
    headerCut,
    repeatCut,
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
        date: l.page.date,
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
    if (teaser.page.layout === "D") {
      const label = `${context}: «${title}» → ${teaser.relFile}`;
      if (teaser.page.headerCut) report.headerCut += 1;
      else report.headerNotCut.push(label);
      if (teaser.page.repeatCut) report.headerRepeatCut.push(label);
    }
    // Стоп задания: тело тизера после срезки шапки короче порога — срезано лишнее.
    const bodyPlainLen = stripTags(bodyHtmlOut).length;
    if (bodyPlainLen < HEADER_CUT_MIN_BODY) {
      runErrors.push(
        `${context}: «${title}» → ${teaser.relFile}: тело после срезки шапки короче ${HEADER_CUT_MIN_BODY} знаков (${bodyPlainLen})`,
      );
    }
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
  L.push("## Шапка article-страницы у тизерных записей (схема D)");
  L.push("");
  L.push(
    `Срезана (баннер, заголовок страницы, строка публикации): ${report.headerCut}. Фото и объём страницы считаются по региону с шапкой.`,
  );
  L.push("");
  section("Срезан и повтор заголовка сразу после строки публикации", report.headerRepeatCut);
  section("Шапка не распознана (тело оставлено целиком)", report.headerNotCut);
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

/**
 * Единая нормализация профиля (п.0 ТЗ): снять теги → декодировать сущности
 * (именованные и числовые) → схлопнуть пробелы → trim. Все длины и сравнения
 * профиля считаются только через неё. С починкой A1 (чистка архива) боевой
 * stripTags декодирует тем же словарём decodeEntities — отдельная копия
 * нормализации больше не нужна, профиль зовёт его же.
 */
function plainProf(html: string): string {
  return stripTags(html);
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

type ProfTables = {
  всего: number;
  данных: number;
  вёрстки: number;
  макс: string | null;
  /** Таблиц на глубине ≥ 1 (внутри другой таблицы) — A7. */
  вложенных: number;
  /** Максимальная глубина: 1 — таблицы без вложенности, 0 — таблиц нет. */
  глубина: number;
  /** Таблиц данных, внутри которых есть другая таблица — в теле разворачиваются (A4). */
  данныхСВложенными: number;
};

/**
 * Сводка таблиц фрагмента для профиля — по общему analyzeTables: тот же
 * признак «данных/вёрстки», что и у санитайзера, счёт и поведение не
 * расходятся.
 */
function profAnalyzeTables(html: string): ProfTables {
  const tables = analyzeTables(html);
  let макс: string | null = null;
  let maxArea = -1;
  for (const t of tables) {
    if (t.rows * t.cols > maxArea) {
      maxArea = t.rows * t.cols;
      макс = `${t.rows}×${t.cols}`;
    }
  }
  return {
    всего: tables.length,
    данных: tables.filter((t) => t.data).length,
    вёрстки: tables.filter((t) => !t.data).length,
    макс,
    вложенных: tables.filter((t) => t.depth > 0).length,
    глубина: tables.reduce((d, t) => Math.max(d, t.depth + 1), 0),
    данныхСВложенными: tables.filter((t) => t.data && t.nested > 0).length,
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

type ProfSingleImg = { src: string; ширина: number | null; высота: number | null };

type ProfPhotoMarkup = {
  пар: number;
  /** Одиночные <img> вне пары — extractPhotos берёт их как фото без полноразмера. */
  одиночныхImg: number;
  /** Одиночные с width и height, оба ≤ 60. */
  одиночныхМелких: number;
  /** Одиночные с расширением .gif. */
  одиночныхGif: number;
  /** Одиночные-декорации: объединение «мелкий» и «.gif», каждый img — один раз. */
  одиночныхДекор: number;
  /**
   * Наблюдение, не вывод: элемент фото-разметки с минимальной позицией во
   * фрагменте (старт пары или одиночный img). null — элементов нет.
   */
  первый: { позиция: number; одиночный: boolean; декор: boolean } | null;
  alt: number;
  title: number;
  одиночные: ProfSingleImg[];
};

/** src без query/hash — ключ группировки в инвентаре. */
const imgSrcKey = (src: string): string => src.split(/[?#]/)[0];
/** Последний сегмент пути src. */
const imgBasename = (src: string): string => {
  const key = imgSrcKey(src);
  return key.slice(key.lastIndexOf("/") + 1);
};
/** Расширение basename в нижнем регистре, иначе «(без расширения)». */
const imgExt = (src: string): string => {
  const m = imgBasename(src)
    .toLowerCase()
    .match(/\.[a-z0-9]+$/);
  return m ? m[0] : "(без расширения)";
};
/** Мелкий: width и height оба присутствуют и оба ≤ 60. */
const isSmallImg = (i: ProfSingleImg): boolean =>
  i.ширина !== null && i.высота !== null && i.ширина <= 60 && i.высота <= 60;
/** Декорация: мелкий либо .gif (объединение, без двойного счёта). */
const isDecorImg = (i: ProfSingleImg): boolean => isSmallImg(i) || imgExt(i.src) === ".gif";

/**
 * Фото-разметка фрагмента: пары полноразмер/превью по тем же регэкспам, что
 * extractPhotos (копии литералов: общие /g-регэкспы делили бы lastIndex);
 * «одиночный img» — <img> вне распознанной пары; extractPhotos берёт его как
 * фото без полноразмера (третий проход, схема C1), поэтому риск класса —
 * декорация (мелкий img или .gif) в галерее/обложке, а не потеря фото.
 * Манифест не нужен — чисто по разметке.
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
  const одиночные: ProfSingleImg[] = [];
  const singleAt: number[] = [];
  const imgRe = /<img\b[^>]*>/gi;
  const attrInt = (tag: string, name: string): number | null => {
    const am = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)`, "i"));
    return am ? Number(am[1]) : null;
  };
  while ((m = imgRe.exec(html))) {
    const inside = consumed.some(([a, b]) => m!.index >= a && m!.index < b);
    if (inside) continue;
    const tag = m[0];
    const sm = tag.match(/\bsrc\s*=\s*["']?([^"'\s>]+)/i);
    одиночные.push({
      src: sm ? sm[1] : "",
      ширина: attrInt(tag, "width"),
      высота: attrInt(tag, "height"),
    });
    singleAt.push(m.index);
  }
  let первый: ProfPhotoMarkup["первый"] = null;
  const firstPair = consumed.length > 0 ? Math.min(...consumed.map(([a]) => a)) : null;
  let firstSingle = -1;
  for (let i = 0; i < singleAt.length; i++) {
    if (firstSingle === -1 || singleAt[i] < singleAt[firstSingle]) firstSingle = i;
  }
  if (firstSingle !== -1 && (firstPair === null || singleAt[firstSingle] < firstPair)) {
    первый = {
      позиция: singleAt[firstSingle],
      одиночный: true,
      декор: isDecorImg(одиночные[firstSingle]),
    };
  } else if (firstPair !== null) {
    первый = { позиция: firstPair, одиночный: false, декор: false };
  }
  return {
    пар,
    одиночныхImg: одиночные.length,
    одиночныхМелких: одиночные.filter(isSmallImg).length,
    одиночныхGif: одиночные.filter((i) => imgExt(i.src) === ".gif").length,
    одиночныхДекор: одиночные.filter(isDecorImg).length,
    первый,
    alt,
    title,
    одиночные,
  };
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
      вложенных: a.таблицы.вложенных + b.таблицы.вложенных,
      глубина: Math.max(a.таблицы.глубина, b.таблицы.глубина),
      данныхСВложенными: a.таблицы.данныхСВложенными + b.таблицы.данныхСВложенными,
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
      одиночныхImg: a.фотоРазметка.одиночныхImg + b.фотоРазметка.одиночныхImg,
      одиночныхМелких: a.фотоРазметка.одиночныхМелких + b.фотоРазметка.одиночныхМелких,
      одиночныхGif: a.фотоРазметка.одиночныхGif + b.фотоРазметка.одиночныхGif,
      одиночныхДекор: a.фотоРазметка.одиночныхДекор + b.фотоРазметка.одиночныхДекор,
      // Наблюдение переносится в порядке слияния (лента → article по порядку
      // поглощения); вывод о декоративной обложке делается при чтении.
      первый: a.фотоРазметка.первый ?? b.фотоРазметка.первый,
      alt: a.фотоРазметка.alt + b.фотоРазметка.alt,
      title: a.фотоРазметка.title + b.фотоРазметка.title,
      одиночные: [...a.фотоРазметка.одиночные, ...b.фотоРазметка.одиночные],
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
type D1Forms = { сТочкой: boolean; безТочки: boolean };

/**
 * д1: остаточные HTML-сущности в плоском поле (по СЫРОЙ строке, без plain),
 * по формам: с `;` — любое имя и любые числовые (неизвестное имя с `;` —
 * подозрительный токен); без `;` — только словарные имена и числовые.
 */
function d1Forms(s: string): D1Forms {
  const out: D1Forms = { сТочкой: false, безТочки: false };
  for (const m of s.matchAll(ENTITY_RE)) {
    if (m[2] === ";") out.сТочкой = true;
    else if (isKnownEntity(m[1])) out.безТочки = true;
  }
  return out;
}

const d1Any = (f: D1Forms): boolean => f.сТочкой || f.безТочки;

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

// ───────────────────────── профиль: инвентаризация перед миграцией (д6–д8, картинки, анонс, ленты) ─────────────────────────

/** д6: бакет дельты в днях между датой записи и датой поглощённой страницы. */
function profD6Bucket(delta: number): string {
  return delta === 0
    ? "0"
    : delta <= 7
      ? "1–7"
      : delta <= 30
        ? "8–30"
        : delta <= 60
          ? "31–60"
          : "61+";
}

type D6 = {
  /** Главная поглощённая страница: тизер, иначе первая поглощённая по порядку ссылок. */
  страница: string | null;
  датаСтраницы: string | null;
  дельта: number | null;
  флаг: boolean;
  /** Дельта по каждой поглощённой странице записи (для распределения по страницам). */
  поСтраницам: Array<{ relFile: string; дельта: number | null }>;
};

/**
 * д6 — дата ленты ≠ дата article: дата записи сравнивается с датой главной
 * поглощённой страницы (тизер, иначе первая поглощённая). Дата страницы —
 * та же, что использовал боевой путь для правила 60 дней (ArticlePage.date:
 * «Опубликовано …», иначе имя файла); дельта — модуль разницы в днях, как в
 * daysBetween. Записи без поглощения — страница null, флаг false.
 */
function profD6(
  absorbed: Array<{ relFile: string; date: string | null }>,
  teaserRelFile: string | null,
  recordDate: string,
): D6 {
  const поСтраницам = absorbed.map((a) => ({
    relFile: a.relFile,
    дельта: a.date === null ? null : Math.round(daysBetween(a.date, recordDate)),
  }));
  const primary =
    (teaserRelFile ? absorbed.find((a) => a.relFile === teaserRelFile) : undefined) ?? absorbed[0];
  if (!primary)
    return { страница: null, датаСтраницы: null, дельта: null, флаг: false, поСтраницам };
  const дельта = primary.date === null ? null : Math.round(daysBetween(primary.date, recordDate));
  return {
    страница: primary.relFile,
    датаСтраницы: primary.date,
    дельта,
    флаг: дельта !== null && дельта > 0,
    поСтраницам,
  };
}

/** д7: порог длины плоского текста поглощённой страницы (знаков, включительно). */
const D7_THRESHOLD = 500;

type D7 = {
  страниц: number;
  суммаДлин: number;
  страницы: Array<{ relFile: string; длина: number }>;
};

/**
 * д7 — поглощена страница с собственным текстом. Телом записи становится
 * только первая ссылка с кейсом «тизер»; все остальные поглощённые страницы
 * (и с кейсом «галерея», и с кейсом «тизер», не ставшие первой) отдают лишь
 * фото и документы, их текст пропадает. Для каждой такой страницы — длина
 * плоского текста после санитайзера в silent (то, что стало бы телом
 * отдельной записи); страница считается, если длина ≥ D7_THRESHOLD.
 */
function profD7(
  absorbed: Array<{ relFile: string; url: string; bodyHtml: string }>,
  teaserRelFile: string | null,
): D7 {
  const страницы: D7["страницы"] = [];
  for (const a of absorbed) {
    if (a.relFile === teaserRelFile) continue;
    const длина = plainProf(sanitizeBody(a.bodyHtml, { baseUrl: a.url, silent: true })).length;
    if (длина >= D7_THRESHOLD) страницы.push({ relFile: a.relFile, длина });
  }
  return {
    страниц: страницы.length,
    суммаДлин: страницы.reduce((s, p) => s + p.длина, 0),
    страницы,
  };
}

/**
 * д8: известные префиксы плоского тела тизерной записи, снимаемые перед
 * сравнением с заголовком: остаток Dreamweaver-комментария (д2) и сквозной
 * баннер шаблона «ФЕСТИВАЛЬ ТЕННИСНЫХ ГОРОДОВ» (в нормализованном виде).
 */
const D8_JUNK_PREFIXES = ["instancebegineditable name edit02", "фестиваль теннисных городов"];
/** д8(б): строка «Опубликовано ДД месяц ГГГГ г.» — буквально по ТЗ. */
const D8_PUBLISHED_RE = /Опубликовано \d+ [а-я]+ \d{4} г\./;
/** д8(а): голова заголовка — слова до накопления этого числа знаков. */
const D8_HEAD_MIN = 20;

/**
 * д8(а) нестрого: ожидаемое число после срезки шапки — лид-предложения,
 * повторяющие начало заголовка (2023/0626, 2023/0527). Печатается всегда;
 * рост в будущих прогонах — повод посмотреть глазами, не дефект.
 */
const D8_LOOSE_EXPECTED = 2;

/** Голова заголовка: слова до накопления ≥ D8_HEAD_MIN знаков; короткий заголовок — целиком. */
function profTitleHead(normTitle: string): string {
  if (normTitle.length <= D8_HEAD_MIN) return normTitle;
  let head = "";
  for (const w of normTitle.split(" ")) {
    head = head ? `${head} ${w}` : w;
    if (head.length >= D8_HEAD_MIN) break;
  }
  return head;
}

/** text начинается словами prefix (по границе слова). */
const startsWithWords = (text: string, prefix: string): boolean =>
  prefix !== "" && (text === prefix || text.startsWith(`${prefix} `));

type D8 = { а: boolean; аНестрого: boolean; б: boolean };

/**
 * д8 — шапка article в теле тизерной записи, два флага по отдельности:
 * (а) плоское тело — после снятия D8_JUNK_PREFIXES — начинается с заголовка
 * записи либо заголовка article-страницы (<title>) целиком; аНестрого —
 * с головы заголовка (≥ D8_HEAD_MIN знаков): после срезки шапки срабатывает
 * на лид-предложениях, повторяющих начало заголовка, поэтому печатается
 * справочно с ожиданием D8_LOOSE_EXPECTED; (б) тело содержит строку
 * «Опубликовано ДД месяц ГГГГ г.».
 */
function profD8(bodyPlain: string, titles: string[]): D8 {
  let b = normText(bodyPlain);
  for (const junk of D8_JUNK_PREFIXES) {
    if (startsWithWords(b, junk)) b = b.slice(junk.length).trim();
  }
  const norms = titles.map(normText).filter((t) => t !== "");
  return {
    а: norms.some((t) => startsWithWords(b, t)),
    аНестрого: norms.some((t) => startsWithWords(b, profTitleHead(t))),
    б: D8_PUBLISHED_RE.test(bodyPlain),
  };
}

/** <title> article-страницы — читается из файла архива (только чтение, кэш по relFile). */
const articleTitleCache = new Map<string, string | null>();

function profArticleTitle(relFile: string): string | null {
  const cached = articleTitleCache.get(relFile);
  if (cached !== undefined) return cached;
  const fullPath = join(ARCHIVE, "download", relFile.split("/").join("\\"));
  let title: string | null = null;
  if (existsSync(fullPath)) {
    const m = readCp1251(fullPath).match(/<title>([\s\S]*?)<\/title>/i);
    if (m) title = plainProf(m[1]);
  }
  articleTitleCache.set(relFile, title);
  return title;
}

/** Повторяющийся src: ключ src встречается одиночным не менее чем в minRecords записях. */
function profRepeatedSrcKeys(perRecord: string[][], minRecords = 3): Set<string> {
  const recs = new Map<string, number>();
  for (const srcs of perRecord) {
    for (const key of new Set(srcs.map(imgSrcKey))) recs.set(key, (recs.get(key) ?? 0) + 1);
  }
  return new Set(
    [...recs]
      .filter(([, n]) => n >= minRecords)
      .map(([k]) => k)
      .sort(),
  );
}

/** Логотип по пути: ключ src содержит сегмент «logos/». */
const isLogoSrc = (src: string): boolean => imgSrcKey(src).includes("logos/");

/**
 * Граница предложения для правила анонса: знак конца (. ! ? …) с возможными
 * закрывающими кавычками/скобками, затем пробел. Сокращения («г.», «ул.»)
 * рвут предложение — это свойство самого правила, а не измерения.
 */
const SENTENCE_SPLIT_RE = /(?<=[.!?…][»”"')\]]*)\s+/u;
/** Пороги примерки правила анонса (знаков). */
const EXCERPT_THRESHOLDS = [150, 200, 250, 300];

/**
 * Правило анонса (примерка, для решения Антона): при пустом анонсе карточка
 * берёт начало плоского тела до n знаков по границе предложения; если первое
 * предложение длиннее n — по границе слова с многоточием (итог ≤ n). Пустое
 * тело → пустая строка. Тело короче n — целиком.
 */
function excerptFromBody(plain: string, n: number): { текст: string; поСлову: boolean } {
  const text = plain.trim();
  if (text === "") return { текст: "", поСлову: false };
  if (text.length <= n) return { текст: text, поСлову: false };
  let out = "";
  for (const s of text.split(SENTENCE_SPLIT_RE)) {
    const candidate = out ? `${out} ${s}` : s;
    if (candidate.length > n) break;
    out = candidate;
  }
  if (out !== "") return { текст: out, поСлову: false };
  const head = text.slice(0, n - 1);
  const cut = head.lastIndexOf(" ");
  const words = (cut > 0 ? head.slice(0, cut) : head).replace(/[\s,;:—–-]+$/u, "");
  return { текст: `${words}…`, поСлову: true };
}

/** Заголовок целиком в верхнем регистре: есть буквы и нет ни одной строчной. */
const isUpperTitle = (t: string): boolean => /\p{L}/u.test(t) && !/\p{Ll}/u.test(t);

/** Смежные ленты легаси (файлы download/), считаются по регулярным выражениям. */
const ADJACENT_FEEDS = ["plt_news.html", "pobeda.html", "festvest.html", "150.html"];

type AdjacentLink = { relFile: string; класс: "а" | "б" | "в"; записи: string[] };

type AdjacentFeed = {
  file: string;
  есть: boolean;
  /** Вхождений строки «Опубликовано:» после снятия комментариев / в сыром html. */
  опубликовано: number;
  опубликованоСырое: number;
  /** ISO-даты, распознанные из «Опубликовано: дд.мм.гггг». */
  даты: string[];
  /** Уникальные ссылки на страницы /ГГГГ/ММДД (с суффиксами), по классам. */
  ссылки: AdjacentLink[];
  /** Обратная связь: записи экспорта со ссылкой на ленту. */
  записиВТеле: string[];
  вхожденийВТеле: number;
  изЛенты: { записей: number; вхождений: number };
  изТизера: { записей: number; вхождений: number };
  изПрочихПоглощённых: { записей: number; страниц: number; вхождений: number };
};

/** Число <a href> фрагмента, ведущих на страницу /file легаси (любая форма хоста и схемы). */
function profCountLinksTo(html: string, baseUrl: string, file: string): number {
  let n = 0;
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)/gi)) {
    const abs = absolutize(m[1], baseUrl);
    if (abs && isTennisfed(abs) && new URL(abs).pathname.toLowerCase() === `/${file.toLowerCase()}`)
      n += 1;
  }
  return n;
}

/**
 * Одна смежная лента: счёт «Опубликовано:», даты, уникальные article-ссылки
 * с разбивкой (а) страница — article-страница записи экспорта (по ссылкам
 * записей, любой кейс), (б) файл есть в архиве, записью не стал, (в) файла
 * в архиве нет; обратная связь — ссылки на ленту из записей по источникам.
 */
function profAdjacentFeed(
  file: string,
  referenced: Map<string, string[]>,
  items: Array<{ key: string; rec: OutputRecord; cap: ProfCapture }>,
): AdjacentFeed {
  const out: AdjacentFeed = {
    file,
    есть: false,
    опубликовано: 0,
    опубликованоСырое: 0,
    даты: [],
    ссылки: [],
    записиВТеле: [],
    вхожденийВТеле: 0,
    изЛенты: { записей: 0, вхождений: 0 },
    изТизера: { записей: 0, вхождений: 0 },
    изПрочихПоглощённых: { записей: 0, страниц: 0, вхождений: 0 },
  };
  const fullPath = join(ARCHIVE, "download", file);
  if (!existsSync(fullPath)) return out;
  out.есть = true;
  const raw = readCp1251(fullPath);
  const html = blankComments(raw);
  const baseUrl = `${SITE}/${file}`;
  out.опубликованоСырое = (raw.match(/Опубликовано:/g) ?? []).length;
  out.опубликовано = (html.match(/Опубликовано:/g) ?? []).length;
  out.даты = [...html.matchAll(/Опубликовано:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/g)].map(
    (m) => toIsoFixed(Number(m[1]), Number(m[2]), Number(m[3])).iso,
  );
  const rels = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']?([^"'\s>]+)/gi)) {
    const abs = absolutize(m[1], baseUrl);
    const rel = abs ? articleRelFile(abs) : null;
    if (rel) rels.add(rel);
  }
  out.ссылки = [...rels].sort().map((rel) => {
    const recs = referenced.get(rel);
    if (recs) return { relFile: rel, класс: "а" as const, записи: recs };
    const onDisk = existsSync(join(ARCHIVE, "download", rel.split("/").join("\\")));
    return { relFile: rel, класс: onDisk ? ("б" as const) : ("в" as const), записи: [] };
  });
  for (const { key, rec, cap } of items) {
    const inBody = profCountLinksTo(rec["ТекстHTML"], cap.feedUrl, file);
    if (inBody > 0) {
      out.записиВТеле.push(key);
      out.вхожденийВТеле += inBody;
    }
    const inFeed = profCountLinksTo(cap.feedFragment, cap.feedUrl, file);
    if (inFeed > 0) {
      out.изЛенты.записей += 1;
      out.изЛенты.вхождений += inFeed;
    }
    if (cap.teaserBodyHtml !== null && cap.teaserUrl !== null) {
      const inTeaser = profCountLinksTo(cap.teaserBodyHtml, cap.teaserUrl, file);
      if (inTeaser > 0) {
        out.изТизера.записей += 1;
        out.изТизера.вхождений += inTeaser;
      }
    }
    let pages = 0;
    let occ = 0;
    for (const a of cap.absorbed) {
      if (a.relFile === cap.teaserRelFile) continue;
      const n = profCountLinksTo(a.bodyHtml, a.url, file);
      if (n > 0) {
        pages += 1;
        occ += n;
      }
    }
    if (pages > 0) {
      out.изПрочихПоглощённых.записей += 1;
      out.изПрочихПоглощённых.страниц += pages;
      out.изПрочихПоглощённых.вхождений += occ;
    }
  }
  return out;
}

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
  /**
   * Первый элемент фото-разметки приоритетного фрагмента (лента; если в ней
   * нет ни пары, ни одиночного img — article) — одиночный img-декорация.
   * Признак разметочный: разрешение по манифесту не учитывается.
   */
  декорОбложка: boolean;
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
  /** Тегов `<table` в теле записи (после A4 — таблицы данных). */
  таблицВТеле: number;
};

type Detectors = {
  д1: {
    заголовок: boolean;
    анонс: boolean;
    документы: boolean;
    любое: boolean;
    /** По формам записи (с `;` и без неё) — для заголовка и анонса. */
    формы: { заголовок: D1Forms; анонс: D1Forms };
  };
  д2: { тело: boolean; поля: boolean; любое: boolean };
  д3: { а: boolean | null; б: boolean; в: string[]; г: boolean | null; любое: boolean };
  д4: boolean;
  д5: boolean;
  /** д6 — дата ленты ≠ дата главной поглощённой article-страницы; см. profD6. */
  д6: D6;
  /** д7 — поглощена страница с собственным текстом (не ставшая телом); см. profD7. */
  д7: D7;
  /** д8 — шапка article в теле; только у тизерных записей, иначе null; см. profD8. */
  д8: D8 | null;
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
    таблицВТеле: (body.match(/<table\b/g) ?? []).length,
  };
}

function profDetectors(rec: OutputRecord, cap: ProfCapture): Detectors {
  const body = rec["ТекстHTML"];
  const pBody = plainProf(body);
  const д1заголовок = d1Forms(rec["Заголовок"]);
  const д1анонс: D1Forms =
    rec["Анонс"] !== undefined ? d1Forms(rec["Анонс"]) : { сТочкой: false, безТочки: false };
  const д1 = {
    заголовок: d1Any(д1заголовок),
    анонс: d1Any(д1анонс),
    документы: (rec["Документы"] ?? []).some((d) => d1Any(d1Forms(d))),
    любое: false,
    формы: { заголовок: д1заголовок, анонс: д1анонс },
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

  // д8 — только у тизерных записей: заголовок записи и <title> article-страницы.
  let д8: D8 | null = null;
  if (cap.teaserRelFile !== null) {
    const artTitle = profArticleTitle(cap.teaserRelFile);
    д8 = profD8(pBody, artTitle === null ? [rec["Заголовок"]] : [rec["Заголовок"], artTitle]);
  }

  return {
    д1,
    д2,
    д3,
    д4: pBody.length < 30,
    д5: rec["Анонс"] !== undefined && pBody === plainProf(rec["Анонс"]),
    д6: profD6(cap.absorbed, cap.teaserRelFile, rec["Дата"]),
    д7: profD7(cap.absorbed, cap.teaserRelFile),
    д8,
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
    декорОбложка:
      сумма.фотоРазметка.первый?.одиночный === true && сумма.фотоРазметка.первый.декор === true,
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
  t("одиночныйImg", (p) => p.источник.сумма.фотоРазметка.одиночныхImg > 0);
  t("одиночныйImgДекор", (p) => p.источник.сумма.фотоРазметка.одиночныхДекор > 0);
  t("декорОбложка", (p) => p.трансформация.декорОбложка);
  t("моджибейк:fffd", (p) => p.источник.сумма.моджибейк.fffd);
  t("моджибейк:latin1", (p) => p.источник.сумма.моджибейк.latin1);
  t("моджибейк:???", (p) => p.источник.сумма.моджибейк.вопросы);
  t("моджибейк:РС", (p) => p.источник.сумма.моджибейк.чередованиеРС);
  t("таблицаДанных", (p) => p.источник.сумма.таблицы.данных > 0);
  t("псевдозаголовок", (p) => p.результат.псевдоЗаголовки > 0);
  t("псевдосписок", (p) => p.результат.псевдоСписки > 0);
  t(
    "цветнойТекст",
    (p) => p.источник.сумма.выравнивание.color + p.источник.сумма.выравнивание.fontColor > 0,
  );
  t("заголовок81+", (p) => p.результат.длинаЗаголовка > 80);
  // Каждое расширение документов, встречающееся в экспорте, — отдельной целью.
  const extNames = new Set<string>();
  for (const p of profs) for (const e of p.трансформация.расширенияДокументов) extNames.add(e);
  for (const ext of [...extNames].sort()) {
    goals.push({
      id: `расширение=${ext}`,
      pred: (p) => p.трансформация.расширенияДокументов.includes(ext),
    });
  }
  // Ненулевые по популяции выброшенные теги — флагами; iframe|embed|object|video — одним.
  const tagNames = new Set<string>();
  for (const p of profs)
    for (const k of Object.keys(p.источник.сумма.выброшенныеТеги)) tagNames.add(k);
  let mergedAdded = false;
  for (const name of [...tagNames].sort()) {
    if (name === "table") continue; // макет ленты, есть у ~83% записей — не признак
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
    p.источник.сумма.фотоРазметка.одиночныхImg === 0 &&
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

/**
 * отбор — почему запись попала в выборку (цели жадного шага, крайняя,
 * обычная): по нему группировка в sample.md. причины — отбор плюс все цели
 * покрытия, которые запись закрывает: колонка «Причины отбора».
 */
type SampleEntry = { idx: number; отбор: string[]; причины: string[] };

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

  // 4) Причины — отбор плюс все цели покрытия, которые запись закрывает, а не
  // только те, ради которых её взял жадный шаг. Группировка sample.md — по
  // отбору (иначе «год=…» есть у всех и поглотил бы все группы, включая
  // «обычная»); крайние и «обычная» — механизмы отбора, а не цели.
  const entries: SampleEntry[] = [...causes.entries()]
    .map(([idx, отбор]) => {
      const причины = [...отбор];
      for (const g of goals) {
        if (g.pred(profs[idx]) && !причины.includes(g.id)) причины.push(g.id);
      }
      return { idx, отбор, причины };
    })
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
  L.push("### Вложенные таблицы (A7)");
  L.push("");
  L.push(
    `- записей с таблицей внутри другой таблицы: ${have.filter((p) => g(p).таблицы.вложенных > 0).length}; вложенных таблиц всего: ${have.reduce((s, p) => s + g(p).таблицы.вложенных, 0)}; максимальная глубина: ${have.reduce((d, p) => Math.max(d, g(p).таблицы.глубина), 0)} (1 — без вложенности)`,
  );
  L.push(
    `- записей с таблицей данных, внутри которой есть другая таблица (в теле разворачивается): ${have.filter((p) => g(p).таблицы.данныхСВложенными > 0).length}`,
  );
  L.push("");
  counterTable(L, "center-теги", have, (p) => g(p).выравнивание.center);
  counterTable(L, "align=center", have, (p) => g(p).выравнивание.alignCenter);
  counterTable(L, "атрибуты style", have, (p) => g(p).выравнивание.style);
  counterTable(L, "атрибуты color", have, (p) => g(p).выравнивание.color);
  counterTable(L, "font color", have, (p) => g(p).выравнивание.fontColor);
  counterTable(L, "распознанные пары фото", have, (p) => g(p).фотоРазметка.пар);
  counterTable(
    L,
    "одиночные img (взяты как фото без полноразмера)",
    have,
    (p) => g(p).фотоРазметка.одиночныхImg,
  );
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

/** Инвентарь одиночных img по сумме источника: src, расширения, декорации, декоративная обложка. */
function singleImgInventorySection(L: string[], profs: ProfileRecord[]): void {
  L.push("## Одиночные img: инвентарь src (по сумме источника)");
  L.push("");
  L.push(
    "Одиночный img — `<img>` вне распознанной пары полноразмер/превью; extractPhotos берёт " +
      "его как фото без полноразмера (третий проход, схема C1). Признак разметочный: " +
      "разрешение по манифесту не учитывается.",
  );
  L.push("");
  type Agg = { вхождений: number; записи: Set<number> };
  const bySrc = new Map<string, Agg>();
  const byExt = new Map<string, number>();
  const basenames = new Set<string>();
  let всего = 0;
  let мелких = 0;
  let gif = 0;
  let декор = 0;
  profs.forEach((p, idx) => {
    const fm = p.источник.сумма.фотоРазметка;
    всего += fm.одиночныхImg;
    мелких += fm.одиночныхМелких;
    gif += fm.одиночныхGif;
    декор += fm.одиночныхДекор;
    for (const i of fm.одиночные) {
      const key = imgSrcKey(i.src);
      const agg = bySrc.get(key) ?? { вхождений: 0, записи: new Set<number>() };
      agg.вхождений += 1;
      agg.записи.add(idx);
      bySrc.set(key, agg);
      basenames.add(imgBasename(i.src));
      const ext = imgExt(i.src);
      byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
    }
  });

  L.push("### (а) 30 самых частых src");
  L.push("");
  L.push("| src | basename | вхождений | записей |");
  L.push("|---|---|---|---|");
  const top = [...bySrc.entries()]
    .sort(
      ([sa, a], [sb, b]) =>
        b.вхождений - a.вхождений || b.записи.size - a.записи.size || (sa < sb ? -1 : 1),
    )
    .slice(0, 30);
  for (const [src, agg] of top) {
    L.push(
      `| ${mdEsc(src)} | ${mdEsc(imgBasename(src))} | ${agg.вхождений} | ${agg.записи.size} |`,
    );
  }
  if (top.length === 0) L.push("| _нет_ | | | |");
  L.push("");
  L.push(
    `Всего одиночных: ${всего}; уникальных src: ${bySrc.size}; уникальных basename: ${basenames.size}.`,
  );
  L.push("");

  L.push("### (б) Одиночные img по расширению");
  L.push("");
  L.push("| расширение | вхождений |");
  L.push("|---|---|");
  for (const e of [...byExt.keys()].sort()) L.push(`| ${e} | ${byExt.get(e)} |`);
  if (byExt.size === 0) L.push("| _нет_ | |");
  L.push("");

  L.push("### (в) Декорации среди одиночных img");
  L.push("");
  L.push(`- с width и height, оба ≤ 60: ${мелких} вхождений`);
  L.push(`- с расширением .gif: ${gif} вхождений`);
  L.push(`- декораций (объединение «мелкий» и «.gif», каждый img — один раз): ${декор} вхождений`);
  L.push("");
  flagTable(
    L,
    "Флаг записи одиночныйImgДекор (есть одиночный img мелкий ≤60×60 либо .gif)",
    profs,
    (p) => p.источник.сумма.фотоРазметка.одиночныхДекор > 0,
  );

  L.push("### (г) Декорация первой (флаг декорОбложка)");
  L.push("");
  L.push(
    "Первый элемент фото-разметки приоритетного фрагмента (лента; если в ленте нет ни пары, " +
      "ни одиночного img — article) — одиночный img-декорация. Признак разметочный: " +
      "разрешение по манифесту не учитывается; если декорация не разрешилась, обложкой станет " +
      "следующее фото — уточняется глазами.",
  );
  L.push("");
  flagTable(L, "декорОбложка", profs, (p) => p.трансформация.декорОбложка);
  const flagged = profs.filter((p) => p.трансформация.декорОбложка);
  L.push(
    `Из них в бакете фото=1 (обложка карточки декоративна с высокой вероятностью): ${flagged.filter((p) => p.результат.бакетФото === "1").length}.`,
  );
  L.push("");

  // (д)/(е): повторяющийся src (одиночным в ≥3 записях) и путь с «logos/».
  const perRecord = profs.map((p) => p.источник.сумма.фотоРазметка.одиночные.map((i) => i.src));
  const repeated = profRepeatedSrcKeys(perRecord, 3);
  const flagStats = (pred: (src: string) => boolean) => {
    let картинок = 0;
    const записи = new Set<number>();
    profs.forEach((p, idx) => {
      for (const i of p.источник.сумма.фотоРазметка.одиночные) {
        if (pred(i.src)) {
          картинок += 1;
          записи.add(idx);
        }
      }
    });
    const декор = [...записи].filter((idx) => profs[idx].трансформация.декорОбложка).length;
    return { картинок, записей: записи.size, декорОбложка: декор, записи };
  };
  const rep = flagStats((src) => repeated.has(imgSrcKey(src)));
  const logo = flagStats(isLogoSrc);
  const both = flagStats((src) => repeated.has(imgSrcKey(src)) && isLogoSrc(src));

  L.push("### (д) Повторяющийся src (одиночным в трёх и более записях)");
  L.push("");
  L.push(
    `- уникальных src: ${repeated.size}; картинок: ${rep.картинок}; записей: ${rep.записей}; из них с флагом декорОбложка: ${rep.декорОбложка}`,
  );
  L.push("");
  L.push("Топ-20 повторяющихся src (по числу записей, затем вхождений):");
  L.push("");
  L.push("| src | записей | вхождений |");
  L.push("|---|---|---|");
  const repTop = [...bySrc.entries()]
    .filter(([src]) => repeated.has(src))
    .sort(
      ([sa, a], [sb, b]) =>
        b.записи.size - a.записи.size || b.вхождений - a.вхождений || (sa < sb ? -1 : 1),
    )
    .slice(0, 20);
  for (const [src, agg] of repTop)
    L.push(`| ${mdEsc(src)} | ${agg.записи.size} | ${agg.вхождений} |`);
  if (repTop.length === 0) L.push("| _нет_ | | |");
  L.push("");

  L.push("### (е) Путь содержит `logos/`");
  L.push("");
  L.push(
    `- картинок: ${logo.картинок}; записей: ${logo.записей}; из них с флагом декорОбложка: ${logo.декорОбложка}`,
  );
  L.push(
    `- пересечение с (д): картинок ${both.картинок}, записей ${both.записей}, из них декорОбложка ${both.декорОбложка}`,
  );
  const logoKeys = [...bySrc.keys()].filter((k) => isLogoSrc(k)).sort();
  L.push(`- уникальных src с logos/: ${logoKeys.length}`);
  for (const k of logoKeys) L.push(`  - ${mdEsc(k)} (записей ${bySrc.get(k)!.записи.size})`);
  L.push("");
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

type EntityCell = { вхождений: number; записи: Set<number> };
type EntityRow = { сТочкой: EntityCell; безТочки: EntityCell };

/** Инвентарь сущностей одного поля по записям: имя → счёт по формам (вхождений и записей). */
function tallyEntities(texts: Array<string | undefined>): Map<string, EntityRow> {
  const rows = new Map<string, EntityRow>();
  texts.forEach((text, idx) => {
    if (!text) return;
    for (const m of text.matchAll(ENTITY_RE)) {
      const row = rows.get(m[1]) ?? {
        сТочкой: { вхождений: 0, записи: new Set<number>() },
        безТочки: { вхождений: 0, записи: new Set<number>() },
      };
      const cell = m[2] === ";" ? row.сТочкой : row.безТочки;
      cell.вхождений += 1;
      cell.записи.add(idx);
      rows.set(m[1], row);
    }
  });
  return rows;
}

/**
 * Раздел «Сущности»: все встреченные имена по формам, отдельно для заголовков,
 * анонсов и тел; имена вне словаря — отдельной строкой (их надо добавить в
 * NAMED_ENTITIES либо признать не-сущностью, как «Play&Stay;»).
 */
function renderEntityInventory(L: string[], records: OutputRecord[]): void {
  L.push("### Сущности: имена по формам (с `;` / без `;`)");
  L.push("");
  L.push(
    "Без `;` считаются любые токены `&имя` — в том числе не-сущности вроде «S&K»; " +
      "словарные они или нет, видно по колонке. Обрезанная сущность — словарное имя без `;`.",
  );
  L.push("");
  const scopes: Array<[string, Array<string | undefined>]> = [
    ["заголовки", records.map((r) => r["Заголовок"])],
    ["анонсы", records.map((r) => r["Анонс"])],
    ["тела", records.map((r) => r["ТекстHTML"])],
  ];
  for (const [scope, texts] of scopes) {
    const rows = tallyEntities(texts);
    const names = [...rows.keys()].sort();
    L.push(`#### ${scope}: имён ${names.length}`);
    L.push("");
    L.push("| имя | в словаре | с `;`: вхождений / записей | без `;`: вхождений / записей |");
    L.push("|---|---|---|---|");
    for (const name of names) {
      const r = rows.get(name)!;
      L.push(
        `| ${mdEsc(name)} | ${isKnownEntity(name) ? "да" : "нет"} | ${r.сТочкой.вхождений} / ${r.сТочкой.записи.size} | ${r.безТочки.вхождений} / ${r.безТочки.записи.size} |`,
      );
    }
    if (names.length === 0) L.push("| _нет_ | | | |");
    L.push("");
    const list = (pred: (n: string) => boolean) => names.filter(pred).join(", ") || "нет";
    L.push(
      `- имена вне словаря с \`;\` (добавить в словарь либо признать не-сущностью): ${list((n) => !isKnownEntity(n) && rows.get(n)!.сТочкой.вхождений > 0)}`,
    );
    L.push(
      `- токены вне словаря без \`;\` (не-сущности, не трогаются): ${list((n) => !isKnownEntity(n) && rows.get(n)!.безТочки.вхождений > 0)}`,
    );
    L.push(
      `- словарные имена без \`;\` (обрезанные сущности): ${list((n) => isKnownEntity(n) && rows.get(n)!.безТочки.вхождений > 0)}`,
    );
    L.push("");
  }
}

/** Ключ ProfileRecord для списков инвентаризации (без заголовка). */
const profKeyShort = (p: ProfileRecord): string => `${p.ключ.файл}#${p.ключ.номер}`;

type ExcerptStats = {
  безАнонса: number;
  сАнонсом: number;
  пустыхТел: number;
  /** По порогам: бакет длины → записей; поСлову — обрезано по границе слова. */
  поПорогам: Array<{ порог: number; бакеты: Map<string, number>; поСлову: number; пустых: number }>;
  анонсБакеты: Map<string, number>;
};

const EXCERPT_LEN_BUCKETS = ["0", "1–50", "51–100", "101–150", "151–200", "201–250", "251–300"];
const excerptLenBucket = (n: number): string =>
  n === 0
    ? "0"
    : n <= 50
      ? "1–50"
      : n <= 100
        ? "51–100"
        : n <= 150
          ? "101–150"
          : n <= 200
            ? "151–200"
            : n <= 250
              ? "201–250"
              : n <= 300
                ? "251–300"
                : "301+";
const ANONS_LEN_BUCKETS = ["0–200", "201–500", "501–1000", "1001+"];
const anonsLenBucket = (n: number): string =>
  n <= 200 ? "0–200" : n <= 500 ? "201–500" : n <= 1000 ? "501–1000" : "1001+";

/** Примерка правила анонса по всем записям без собственного анонса. */
function profExcerptStats(profs: ProfileRecord[], records: OutputRecord[]): ExcerptStats {
  const stats: ExcerptStats = {
    безАнонса: 0,
    сАнонсом: 0,
    пустыхТел: 0,
    поПорогам: EXCERPT_THRESHOLDS.map((порог) => ({
      порог,
      бакеты: new Map<string, number>(),
      поСлову: 0,
      пустых: 0,
    })),
    анонсБакеты: new Map<string, number>(),
  };
  profs.forEach((p, idx) => {
    const rec = records[idx];
    if (rec["Анонс"] !== undefined) {
      stats.сАнонсом += 1;
      const b = anonsLenBucket(plainProf(rec["Анонс"]).length);
      stats.анонсБакеты.set(b, (stats.анонсБакеты.get(b) ?? 0) + 1);
      return;
    }
    stats.безАнонса += 1;
    const plain = plainProf(rec["ТекстHTML"]);
    if (plain === "") stats.пустыхТел += 1;
    for (const t of stats.поПорогам) {
      const r = excerptFromBody(plain, t.порог);
      const b = excerptLenBucket(r.текст.length);
      t.бакеты.set(b, (t.бакеты.get(b) ?? 0) + 1);
      if (r.поСлову) t.поСлову += 1;
      if (r.текст === "") t.пустых += 1;
    }
  });
  return stats;
}

/** Seed выборки excerpt-preview.md (10 случайных записей без анонса). */
const EXCERPT_PREVIEW_SEED = 30;

/**
 * Отбор 30 записей для excerpt-preview.md: 10 с самыми длинными собственными
 * анонсами, 10 с самым длинным plain-телом без анонса, 10 случайных без
 * анонса (mulberry32, seed EXCERPT_PREVIEW_SEED, пул — порядок экспорта без
 * уже отобранных). Равенства — по порядку экспорта; состав детерминирован.
 */
function selectExcerptPreview(
  profs: ProfileRecord[],
  records: OutputRecord[],
): Array<{ idx: number; группа: string }> {
  const idxAll = profs.map((_, i) => i);
  const withAnons = idxAll.filter((i) => records[i]["Анонс"] !== undefined);
  const noAnons = idxAll.filter((i) => records[i]["Анонс"] === undefined);
  const anonsLen = (i: number) => plainProf(records[i]["Анонс"] ?? "").length;
  const bodyLen = (i: number) => profs[i].результат.длинаPlainТела;
  const longestAnons = [...withAnons]
    .sort((a, b) => anonsLen(b) - anonsLen(a) || a - b)
    .slice(0, 10);
  const longestBody = [...noAnons].sort((a, b) => bodyLen(b) - bodyLen(a) || a - b).slice(0, 10);
  const taken = new Set([...longestAnons, ...longestBody]);
  const pool = noAnons.filter((i) => !taken.has(i));
  const rand = mulberry32(EXCERPT_PREVIEW_SEED);
  const random: number[] = [];
  for (let k = 0; k < 10 && pool.length > 0; k++) {
    random.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return [
    ...longestAnons.map((idx) => ({ idx, группа: "10 самых длинных собственных анонсов" })),
    ...longestBody.map((idx) => ({ idx, группа: "10 самых длинных тел без анонса" })),
    ...random.map((idx) => ({
      idx,
      группа: `10 случайных без анонса (mulberry32, seed ${EXCERPT_PREVIEW_SEED})`,
    })),
  ];
}

function renderExcerptPreview(
  profs: ProfileRecord[],
  records: OutputRecord[],
  picks: Array<{ idx: number; группа: string }>,
): string {
  const L: string[] = [];
  L.push("# excerpt-preview — примерка правила анонса (этап 8, --profile)");
  L.push("");
  L.push(
    "Правило: при пустом анонсе карточка берёт начало плоского тела до N знаков по границе " +
      "предложения; если первое предложение длиннее N — по границе слова с многоточием. " +
      `Пороги: ${EXCERPT_THRESHOLDS.join(", ")}. У записей с собственным анонсом правило не ` +
      "применится — варианты показаны справочно.",
  );
  L.push("");
  let группа = "";
  for (const { idx, группа: g } of picks) {
    if (g !== группа) {
      группа = g;
      L.push(`## ${g}`);
      L.push("");
    }
    const p = profs[idx];
    const rec = records[idx];
    const plain = plainProf(rec["ТекстHTML"]);
    L.push(`### ${profKeyShort(p)} — ${p.ключ.дата} — ${mdEsc(p.ключ.заголовок)}`);
    L.push("");
    if (rec["Анонс"] !== undefined) {
      L.push(`- собственный анонс: ${plainProf(rec["Анонс"]).length} знаков`);
    }
    L.push(`- длина plain-тела: ${plain.length}`);
    for (const n of EXCERPT_THRESHOLDS) {
      const r = excerptFromBody(plain, n);
      L.push(
        `- ${n}${r.поСлову ? " (по границе слова)" : ""} [${r.текст.length}]: ${r.текст === "" ? "_пусто_" : mdEsc(r.текст)}`,
      );
    }
    L.push("");
  }
  L.push(`Записей: ${picks.length}.`);
  L.push("");
  return L.join("\n") + "\n";
}

type Control = { текст: string; ок: boolean; факт: string };

type InventoryExtras = {
  feeds: AdjacentFeed[];
  unreferenced: string[];
  excerpt: ExcerptStats;
  previewSize: number;
  records: OutputRecord[];
  controls: Control[];
};

function renderProfileReport(
  profs: ProfileRecord[],
  extremes: ExtremeList[],
  sampleSize: number,
  d3aCalibration: number,
  inv: InventoryExtras,
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
  counterTable(L, "Таблиц в теле записи (A4)", profs, (p) => p.результат.таблицВТеле);
  const withTables = profs.filter((p) => p.результат.таблицВТеле > 0);
  L.push(`### Записи с таблицей в теле: ${withTables.length}`);
  L.push("");
  for (const p of withTables) {
    L.push(
      `- ${profKeyStr(p)} — таблиц в теле ${p.результат.таблицВТеле}, таблиц данных в источнике ${p.источник.сумма.таблицы.данных}`,
    );
  }
  if (withTables.length === 0) L.push("_нет_");
  L.push("");

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
  singleImgInventorySection(L, profs);

  L.push("## Детекторы известных дефектов");
  L.push("");
  detectorSection(L, "д1 — HTML-сущности в плоских полях", profs, (p) => p.детекторы.д1.любое);
  detectorSection(L, "д1: в заголовке", profs, (p) => p.детекторы.д1.заголовок);
  detectorSection(
    L,
    "д1: в заголовке, форма с `;`",
    profs,
    (p) => p.детекторы.д1.формы.заголовок.сТочкой,
  );
  detectorSection(
    L,
    "д1: в заголовке, форма без `;`",
    profs,
    (p) => p.детекторы.д1.формы.заголовок.безТочки,
  );
  detectorSection(L, "д1: в анонсе", profs, (p) => p.детекторы.д1.анонс);
  detectorSection(L, "д1: в анонсе, форма с `;`", profs, (p) => p.детекторы.д1.формы.анонс.сТочкой);
  detectorSection(
    L,
    "д1: в анонсе, форма без `;`",
    profs,
    (p) => p.детекторы.д1.формы.анонс.безТочки,
  );
  detectorSection(L, "д1: в документах", profs, (p) => p.детекторы.д1.документы);
  renderEntityInventory(L, inv.records);
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

  // ── д6 ──
  const absorbedRecs = profs.filter((p) => p.детекторы.д6.страница !== null);
  const d6hits = profs.filter((p) => p.детекторы.д6.флаг);
  L.push(`### д6 — дата ленты ≠ дата article (по главной поглощённой странице): ${d6hits.length}`);
  L.push("");
  L.push(
    `Записей с поглощёнными страницами: ${absorbedRecs.length}. Главная страница — тизер, иначе ` +
      "первая поглощённая; дата страницы — та же, что в правиле 60 дней боевого пути " +
      "(«Опубликовано …», иначе имя файла); дельта — модуль разницы в днях.",
  );
  L.push("");
  const d6RecBuckets = new Map<string, number>();
  for (const p of absorbedRecs) {
    const b =
      p.детекторы.д6.дельта === null ? "дата не установлена" : profD6Bucket(p.детекторы.д6.дельта);
    d6RecBuckets.set(b, (d6RecBuckets.get(b) ?? 0) + 1);
  }
  const d6PageBuckets = new Map<string, number>();
  let d6Pages = 0;
  for (const p of profs) {
    for (const s of p.детекторы.д6.поСтраницам) {
      d6Pages += 1;
      const b = s.дельта === null ? "дата не установлена" : profD6Bucket(s.дельта);
      d6PageBuckets.set(b, (d6PageBuckets.get(b) ?? 0) + 1);
    }
  }
  const D6_ORDER = ["0", "1–7", "8–30", "31–60", "61+", "дата не установлена"];
  L.push(
    `| дельта, дней | записей (по главной странице, из ${absorbedRecs.length}) | поглощённых страниц (из ${d6Pages}) |`,
  );
  L.push("|---|---|---|");
  for (const b of D6_ORDER) {
    if (!d6RecBuckets.has(b) && !d6PageBuckets.has(b)) continue;
    L.push(`| ${b} | ${d6RecBuckets.get(b) ?? 0} | ${d6PageBuckets.get(b) ?? 0} |`);
  }
  L.push("");
  L.push("10 наибольших дельт (ключ, Δ, дата ленты, дата страницы, страница):");
  L.push("");
  const d6top = [...d6hits]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.детекторы.д6.дельта! - a.p.детекторы.д6.дельта! || a.i - b.i)
    .slice(0, 10);
  for (const { p } of d6top) {
    const d = p.детекторы.д6;
    L.push(
      `- ${profKeyStr(p)} — Δ=${d.дельта} дн., лента ${p.ключ.дата}, страница ${d.датаСтраницы === null ? "?" : ddmmyyyy(d.датаСтраницы)}, ${d.страница}`,
    );
  }
  if (d6top.length === 0) L.push("_нет_");
  L.push("");

  // ── д7 ──
  const d7parents = profs.filter((p) => p.детекторы.д7.страниц > 0);
  const d7pages = profs.reduce((s, p) => s + p.детекторы.д7.страниц, 0);
  const d7total = profs.reduce((s, p) => s + p.детекторы.д7.суммаДлин, 0);
  L.push(
    `### д7 — поглощена страница с собственным текстом (≥${D7_THRESHOLD} знаков после санитайзера): страниц ${d7pages}, записей-родителей ${d7parents.length}`,
  );
  L.push("");
  L.push(
    "Телом записи становится только первая ссылка с кейсом «тизер»; остальные поглощённые " +
      "страницы (кейс «галерея» и последующие «тизер») отдают лишь фото и документы — их текст " +
      "теряется. Длина — плоский текст страницы после санитайзера (silent): то, что стало бы " +
      "телом отдельной записи; остаток Dreamweaver и баннер шаблона в длину входят.",
  );
  L.push("");
  L.push(`Суммарная длина потерянного текста по всему экспорту: ${d7total} знаков.`);
  L.push("");
  L.push("10 родителей с наибольшим числом таких страниц (ключ, страниц, суммарная длина):");
  L.push("");
  const d7top = d7parents
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        b.p.детекторы.д7.страниц - a.p.детекторы.д7.страниц ||
        b.p.детекторы.д7.суммаДлин - a.p.детекторы.д7.суммаДлин ||
        a.i - b.i,
    )
    .slice(0, 10);
  for (const { p } of d7top) {
    L.push(
      `- ${profKeyStr(p)} — страниц ${p.детекторы.д7.страниц}, ${p.детекторы.д7.суммаДлин} знаков`,
    );
  }
  if (d7top.length === 0) L.push("_нет_");
  L.push("");

  // ── д8 ──
  const teasers = profs.filter((p) => p.детекторы.д8 !== null);
  const d8a = teasers.filter((p) => p.детекторы.д8!.а);
  const d8aLoose = teasers.filter((p) => p.детекторы.д8!.аНестрого);
  const d8b = teasers.filter((p) => p.детекторы.д8!.б);
  const d8both = teasers.filter((p) => p.детекторы.д8!.а && p.детекторы.д8!.б);
  L.push(`### д8 — шапка article в теле (тизерных записей: ${teasers.length})`);
  L.push("");
  L.push(
    "Перед сравнением с заголовком с начала плоского тела снимаются известные префиксы: " +
      "остаток Dreamweaver-комментария (д2) и сквозной баннер шаблона «ФЕСТИВАЛЬ ТЕННИСНЫХ " +
      "ГОРОДОВ». Нормализация: нижний регистр, ё→е, только буквы и цифры.",
  );
  L.push("");
  L.push(
    `- (а) тело начинается с заголовка записи или <title> article-страницы целиком: ${d8a.length}`,
  );
  L.push(`- (б) тело содержит строку «Опубликовано ДД месяц ГГГГ г.»: ${d8b.length}`);
  L.push(`- оба флага: ${d8both.length}`);
  L.push(
    `- (а) нестрого — с головы заголовка ≥${D8_HEAD_MIN} знаков по границе слова: ${d8aLoose.length} (ожидание ${D8_LOOSE_EXPECTED}: лид-предложения, повторяющие начало заголовка; рост — повод посмотреть, не дефект)`,
  );
  L.push("");
  L.push("Тизерные записи с флагом (а) или (б):");
  L.push("");
  const d8hit = teasers.filter((p) => p.детекторы.д8!.а || p.детекторы.д8!.б);
  for (const p of d8hit)
    L.push(`- ${profKeyStr(p)} — а=${p.детекторы.д8!.а} б=${p.детекторы.д8!.б}`);
  if (d8hit.length === 0) L.push("_нет_");
  L.push("");
  L.push(
    "Нестрогие (а) — ключ и первые 200 знаков тела (глазами: живой текст, не остаток шаблона):",
  );
  L.push("");
  for (const p of d8aLoose) {
    const idx = profs.indexOf(p);
    L.push(`- ${profKeyStr(p)}: ${mdEsc(plainProf(inv.records[idx]["ТекстHTML"]).slice(0, 200))}`);
  }
  if (d8aLoose.length === 0) L.push("_нет_");
  L.push("");

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

  renderAdjacentFeeds(L, inv.feeds, inv.unreferenced);
  renderExcerptStats(L, inv.excerpt, inv.previewSize);
  renderTitles(L, profs);
  renderCandidates2026(L, profs);
  renderYearSummary(L, profs);

  L.push("## Контроли");
  L.push("");
  for (const c of inv.controls) L.push(`- ${c.ок ? "ДА" : "НЕТ"} — ${c.текст}: ${c.факт}`);
  L.push("");
  return L.join("\n") + "\n";
}

function renderAdjacentFeeds(L: string[], feeds: AdjacentFeed[], unreferenced: string[]): void {
  L.push("## Смежные ленты");
  L.push("");
  L.push(
    "Файлы `download/plt_news.html`, `pobeda.html`, `festvest.html`, `150.html`. Только счёт по " +
      "регулярным выражениям и сверка множеств путей; вёрстка не разбиралась. Ссылка — " +
      "`href` на страницу вида `/ГГГГ/ММДД` (с суффиксами), приведённая к относительному " +
      "файлу article; классы: (а) страница — article-страница записи экспорта (по ссылкам " +
      "записей, любой кейс), (б) файл есть в архиве, записью не стал, (в) файла в архиве нет.",
  );
  L.push("");
  L.push(
    "| лента | файл на месте | «Опубликовано:» | дат распознано | диапазон дат | уникальных ссылок | (а) | (б) | (в) |",
  );
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const f of feeds) {
    const dates = [...f.даты].sort();
    const range = dates.length
      ? `${ddmmyyyy(dates[0])} – ${ddmmyyyy(dates[dates.length - 1])}`
      : "—";
    const cls = (k: "а" | "б" | "в") => f.ссылки.filter((l) => l.класс === k).length;
    L.push(
      `| ${f.file} | ${f.есть ? "да" : "**НЕТ — файла нет**"} | ${f.опубликовано}${f.опубликованоСырое !== f.опубликовано ? ` (в сыром html ${f.опубликованоСырое})` : ""} | ${f.даты.length} | ${range} | ${f.ссылки.length} | ${cls("а")} | ${cls("б")} | ${cls("в")} |`,
    );
  }
  L.push("");
  for (const f of feeds) {
    L.push(`### ${f.file}`);
    L.push("");
    if (!f.есть) {
      L.push("_файла нет в download/_");
      L.push("");
      continue;
    }
    const byYear = new Map<string, number>();
    for (const d of f.даты) byYear.set(d.slice(0, 4), (byYear.get(d.slice(0, 4)) ?? 0) + 1);
    L.push(
      `- «Опубликовано:» по годам: ${
        [...byYear.keys()]
          .sort()
          .map((y) => `${y} — ${byYear.get(y)}`)
          .join(", ") || "нет"
      }`,
    );
    for (const k of ["а", "б", "в"] as const) {
      const rows = f.ссылки.filter((l) => l.класс === k);
      const title =
        k === "а"
          ? "(а) article-страница записи экспорта"
          : k === "б"
            ? "(б) есть в архиве, записью не стала"
            : "(в) в архиве нет";
      L.push(`- ${title}: ${rows.length}`);
      for (const l of rows) {
        L.push(`  - ${l.relFile}${k === "а" ? ` → ${l.записи.join("; ")}` : ""}`);
      }
    }
    L.push("");
  }

  L.push("### Пересечение (б) со списком «Article-файлы без ссылок с лент» из parse-report.md");
  L.push("");
  const unionB = new Set<string>();
  for (const f of feeds) for (const l of f.ссылки) if (l.класс === "б") unionB.add(l.relFile);
  const unrefSet = new Set(unreferenced);
  const explained = unreferenced.filter((r) => unionB.has(r));
  const unexplained = unreferenced.filter((r) => !unionB.has(r));
  const onlyInB = [...unionB].filter((r) => !unrefSet.has(r));
  L.push(`- в parse-report.md «без ссылок с лент»: ${unreferenced.length}`);
  L.push(`- объединение (б) по четырём лентам: ${unionB.size}`);
  L.push(
    `- калибровка: в (б), но не в списке parse-report — ${onlyInB.length} (обязан быть 0; иначе множества считаны по-разному)${onlyInB.length ? ": " + onlyInB.join(", ") : ""}`,
  );
  L.push(`- объясняются смежными лентами: ${explained.length}`);
  L.push(`- остаются необъяснёнными: ${unexplained.length}`);
  for (const r of unexplained.slice(0, 50)) L.push(`  - ${r}`);
  if (unexplained.length > 50) L.push(`  - … и ещё ${unexplained.length - 50}`);
  L.push("");

  L.push("## Обратная связь: ссылки на смежные ленты из записей");
  L.push("");
  L.push(
    "Пометка: на article-страницах есть сквозной баннер шаблона «ФЕСТИВАЛЬ ТЕННИСНЫХ ГОРОДОВ» " +
      "со ссылкой на `festvest.html` — ссылка на эту ленту в теле, пришедшая с article-страницы, " +
      "не означает осмысленную связь. Поэтому источники разведены: ленточный фрагмент записи; " +
      "тело тизерной страницы (оно и становится ТекстHTML); прочие поглощённые страницы (их " +
      "текст в ТекстHTML не попадает).",
  );
  L.push("");
  L.push(
    "| лента | записей со ссылкой в ТекстHTML | вхождений | из ленточного фрагмента: записей / вхождений | из тела тизерной страницы: записей / вхождений | с прочих поглощённых страниц: записей / страниц / вхождений |",
  );
  L.push("|---|---|---|---|---|---|");
  for (const f of feeds) {
    L.push(
      `| ${f.file} | ${f.записиВТеле.length} | ${f.вхожденийВТеле} | ${f.изЛенты.записей} / ${f.изЛенты.вхождений} | ${f.изТизера.записей} / ${f.изТизера.вхождений} | ${f.изПрочихПоглощённых.записей} / ${f.изПрочихПоглощённых.страниц} / ${f.изПрочихПоглощённых.вхождений} |`,
    );
  }
  L.push("");
  for (const f of feeds) {
    L.push(`### ${f.file}: ключи записей со ссылкой в ТекстHTML (${f.записиВТеле.length})`);
    L.push("");
    for (const k of f.записиВТеле) L.push(`- ${k}`);
    if (f.записиВТеле.length === 0) L.push("_нет_");
    L.push("");
  }
}

function renderExcerptStats(L: string[], s: ExcerptStats, previewSize: number): void {
  L.push("## Примерка анонса");
  L.push("");
  L.push(
    "Правило (для решения Антона): при пустом анонсе карточка берёт начало плоского тела до N " +
      "знаков, обрезая по границе предложения; если первое предложение длиннее N — по границе " +
      "слова с многоточием (итог ≤ N). Граница предложения — знак конца (. ! ? …) с возможными " +
      "закрывающими кавычками, затем пробел; сокращения («г.», «ул.») рвут предложение.",
  );
  L.push("");
  L.push(`- записей без собственного анонса (правило применится): ${s.безАнонса}`);
  L.push(`- записей с собственным анонсом (правило не применится): ${s.сАнонсом}`);
  L.push(`- пустых тел среди записей без анонса (пустой результат): ${s.пустыхТел}`);
  L.push("");
  L.push("### Распределение длин результата по порогам (записи без анонса)");
  L.push("");
  L.push(`| порог | ${EXCERPT_LEN_BUCKETS.join(" | ")} | по границе слова | пустой результат |`);
  L.push(`|---|${EXCERPT_LEN_BUCKETS.map(() => "---").join("|")}|---|---|`);
  for (const t of s.поПорогам) {
    L.push(
      `| ${t.порог} | ${EXCERPT_LEN_BUCKETS.map((b) => t.бакеты.get(b) ?? 0).join(" | ")} | ${t.поСлову} | ${t.пустых} |`,
    );
  }
  L.push("");
  L.push("### Длины собственных анонсов");
  L.push("");
  L.push("| бакет | записей |");
  L.push("|---|---|");
  for (const b of ANONS_LEN_BUCKETS) L.push(`| ${b} | ${s.анонсБакеты.get(b) ?? 0} |`);
  L.push("");
  L.push(
    `Файл excerpt-preview.md в папке профиля: ${previewSize} записей (10 самых длинных собственных анонсов, 10 самых длинных тел без анонса, 10 случайных без анонса, mulberry32 seed ${EXCERPT_PREVIEW_SEED}).`,
  );
  L.push("");
}

function renderTitles(L: string[], profs: ProfileRecord[]): void {
  L.push("## Заголовки");
  L.push("");
  const upper = profs.filter((p) => isUpperTitle(p.ключ.заголовок));
  L.push(
    `### Целиком в верхнем регистре: ${upper.length} из ${profs.length} (${((100 * upper.length) / profs.length).toFixed(1)} %)`,
  );
  L.push("");
  for (const p of upper) L.push(`- ${profKeyStr(p)}`);
  if (upper.length === 0) L.push("_нет_");
  L.push("");
  const long = profs.filter((p) => p.результат.длинаЗаголовка > 80);
  L.push(`### Длиннее 80 знаков: ${long.length} (до 20 примеров)`);
  L.push("");
  for (const p of long.slice(0, 20)) L.push(`- [${p.результат.длинаЗаголовка}] ${profKeyStr(p)}`);
  if (long.length === 0) L.push("_нет_");
  L.push("");
  const ent = profs.filter((p) => p.детекторы.д1.заголовок);
  const entSemi = profs.filter((p) => p.детекторы.д1.формы.заголовок.сТочкой).length;
  const entBare = profs.filter((p) => p.детекторы.д1.формы.заголовок.безТочки).length;
  L.push(
    `### С HTML-сущностями (д1 в заголовке): ${ent.length} (форма с \`;\` — ${entSemi}, без \`;\` — ${entBare})`,
  );
  L.push("");
  for (const p of ent) L.push(`- ${profKeyStr(p)}`);
  if (ent.length === 0) L.push("_нет_");
  L.push("");
}

function renderCandidates2026(L: string[], profs: ProfileRecord[]): void {
  const rows = profs.filter((p) => p.ключ.датаISO >= "2026-01-01");
  L.push(`## Кандидаты на пересечение с новым сайтом (записи с 2026-01-01): ${rows.length}`);
  L.push("");
  L.push("Список для сверки глазами с базой нового сайта; в БД прибор не ходит.");
  L.push("");
  L.push("| ключ | дата | заголовок |");
  L.push("|---|---|---|");
  for (const p of rows)
    L.push(`| ${profKeyShort(p)} | ${p.ключ.дата} | ${mdEsc(p.ключ.заголовок)} |`);
  if (rows.length === 0) L.push("| _нет_ | | |");
  L.push("");
}

function renderYearSummary(L: string[], profs: ProfileRecord[]): void {
  L.push("## Сводка по годам");
  L.push("");
  L.push(
    "Год — по дате записи. Фото — обложка + галерея; длина тела — plain. д6/д7/д8 — записей с " +
      "флагом; «поглощение» — записей хотя бы с одной поглощённой страницей (тизер или галерея).",
  );
  L.push("");
  L.push(
    "| год | записей | фото | документов | ср. длина тела | макс. длина тела | д1 | д2 | д6 | д7 | д8 | поглощение |",
  );
  L.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  type Row = {
    записей: number;
    фото: number;
    документов: number;
    сумма: number;
    макс: number;
    д1: number;
    д2: number;
    д6: number;
    д7: number;
    д8: number;
    поглощение: number;
  };
  const rows = new Map<string, Row>();
  const zero = (): Row => ({
    записей: 0,
    фото: 0,
    документов: 0,
    сумма: 0,
    макс: 0,
    д1: 0,
    д2: 0,
    д6: 0,
    д7: 0,
    д8: 0,
    поглощение: 0,
  });
  const total = zero();
  const add = (r: Row, p: ProfileRecord) => {
    r.записей += 1;
    r.фото += p.результат.фотоВсего;
    r.документов += p.результат.документов;
    r.сумма += p.результат.длинаPlainТела;
    r.макс = Math.max(r.макс, p.результат.длинаPlainТела);
    if (p.детекторы.д1.любое) r.д1 += 1;
    if (p.детекторы.д2.любое) r.д2 += 1;
    if (p.детекторы.д6.флаг) r.д6 += 1;
    if (p.детекторы.д7.страниц > 0) r.д7 += 1;
    if (p.детекторы.д8 !== null && (p.детекторы.д8.а || p.детекторы.д8.б)) r.д8 += 1;
    if (p.детекторы.д6.страница !== null) r.поглощение += 1;
  };
  for (const p of profs) {
    const y = p.ключ.датаISO.slice(0, 4);
    if (!rows.has(y)) rows.set(y, zero());
    add(rows.get(y)!, p);
    add(total, p);
  }
  const line = (name: string, r: Row) =>
    `| ${name} | ${r.записей} | ${r.фото} | ${r.документов} | ${r.записей ? Math.round(r.сумма / r.записей) : 0} | ${r.макс} | ${r.д1} | ${r.д2} | ${r.д6} | ${r.д7} | ${r.д8} | ${r.поглощение} |`;
  for (const y of [...rows.keys()].sort()) L.push(line(y, rows.get(y)!));
  L.push(line("**итого**", total));
  L.push("");
}

function renderSample(profs: ProfileRecord[], entries: SampleEntry[]): string {
  const L: string[] = [];
  L.push("# sample — детерминированная выборка для проверки глазами (этап 8, --profile)");
  L.push("");
  const groups = new Map<string, SampleEntry[]>();
  for (const e of entries) {
    const главная = mainCause(e.отбор);
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

  // ── инвентаризация: смежные ленты, примерка анонса, контроли ──
  const referenced = new Map<string, string[]>();
  profs.forEach((p) => {
    for (const l of p.трансформация.ссылкиArticle) {
      const arr = referenced.get(l.relFile) ?? [];
      arr.push(`${profKeyShort(p)} (${l.kase})`);
      referenced.set(l.relFile, arr);
    }
  });
  const feedItems = records.map((rec, i) => ({
    key: profKeyShort(profs[i]),
    rec,
    cap: profByRecord.get(rec)!,
  }));
  const feeds = ADJACENT_FEEDS.map((f) => profAdjacentFeed(f, referenced, feedItems));
  const excerpt = profExcerptStats(profs, records);
  const previewPicks = selectExcerptPreview(profs, records);

  const p66 = profs.find((p) => p.ключ.файл === "newsarch_2023.html" && p.ключ.номер === 66);
  const d6of66 = p66?.детекторы.д6;
  const anonsCount = profs.filter((p) => p.результат.естьАнонс).length;
  const controls: Control[] = [
    {
      текст: "newsarch_2023.html#66 в д6 с дельтой 31 день (лента 26.05.2023, статья 26.06.2023)",
      ок:
        d6of66 !== undefined &&
        d6of66.флаг &&
        d6of66.дельта === 31 &&
        p66!.ключ.дата === "26.05.2023" &&
        d6of66.датаСтраницы === "2023-06-26",
      факт: p66
        ? `флаг=${d6of66!.флаг}, Δ=${d6of66!.дельта}, лента ${p66.ключ.дата}, страница ${d6of66!.датаСтраницы ?? "?"} (${d6of66!.страница ?? "—"})`
        : "запись не найдена",
    },
    {
      текст: "у newsarch_2023.html#66 не менее восьми страниц в д7",
      ок: p66 !== undefined && p66.детекторы.д7.страниц >= 8,
      факт: p66
        ? `страниц ${p66.детекторы.д7.страниц} (${p66.детекторы.д7.страницы.map((s) => `${s.relFile}:${s.длина}`).join(", ")})`
        : "запись не найдена",
    },
    {
      текст: "у newsarch_2023.html#66 оба флага д8 истинны",
      ок:
        p66 !== undefined && p66.детекторы.д8 !== null && p66.детекторы.д8.а && p66.детекторы.д8.б,
      факт: p66
        ? p66.детекторы.д8 === null
          ? "запись не тизерная"
          : `а=${p66.детекторы.д8.а} (нестрого ${p66.детекторы.д8.аНестрого}), б=${p66.детекторы.д8.б}`
        : "запись не найдена",
    },
    {
      текст: "записей в экспорте 1882",
      ок: profs.length === 1882,
      факт: `${profs.length}`,
    },
    {
      текст: "записей с собственным анонсом не более 60 (ожидание 56)",
      ок: anonsCount <= 60,
      факт: `${anonsCount}`,
    },
    {
      текст: "все четыре смежные ленты на месте в download/",
      ок: feeds.every((f) => f.есть),
      факт: feeds.map((f) => `${f.file}: ${f.есть ? "есть" : "НЕТ"}`).join(", "),
    },
  ];

  mkdirSync(PROFILE_DIR, { recursive: true });
  const json = JSON.stringify(profs, null, 2) + "\n";
  writeFileSync(join(PROFILE_DIR, "profile.json"), json, "utf-8");
  writeFileSync(
    join(PROFILE_DIR, "profile-report.md"),
    renderProfileReport(profs, extremes, entries.length, d3aCalibration, {
      feeds,
      unreferenced: report.unreferencedArticles,
      excerpt,
      previewSize: previewPicks.length,
      records,
      controls,
    }),
    "utf-8",
  );
  writeFileSync(join(PROFILE_DIR, "sample.md"), renderSample(profs, entries), "utf-8");
  writeFileSync(
    join(PROFILE_DIR, "excerpt-preview.md"),
    renderExcerptPreview(profs, records, previewPicks),
    "utf-8",
  );

  console.log(`Профиль: ${join(PROFILE_DIR, "profile.json")} (${json.length} байт)`);
  console.log(`Профиль-отчёт: ${join(PROFILE_DIR, "profile-report.md")}`);
  console.log(`Выборка: ${join(PROFILE_DIR, "sample.md")} (записей: ${entries.length})`);
  console.log(
    `Примерка анонса: ${join(PROFILE_DIR, "excerpt-preview.md")} (записей: ${previewPicks.length})`,
  );
  console.log(`Калибровка д3(а) без article/склейки: ${d3aCalibration}`);
  for (const c of controls) console.log(`контроль: ${c.ок ? "ДА" : "НЕТ"} — ${c.текст}: ${c.факт}`);
  const failedControls = controls.filter((c) => !c.ок).length;
  if (failedControls > 0) {
    console.error(`Контроли: ${failedControls} с вердиктом НЕТ — выход с кодом 1`);
    process.exit(1);
  }

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
  const decorFirstInput =
    `<p><img src="img/spacer.gif" width="1" height="1">` +
    `<a href="javascript:window.open('bg/1.jpg')"><img src="sm/1.jpg"></a>` +
    `<img src="news/2010/foto.jpg" width="300" height="200"></p>`;
  const pairFirstInput = `<p><a href="bg/1.jpg"><img src="sm/1.jpg"></a><img src="dot.gif" width="10" height="10"></p>`;
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
        name: "профиль: одиночный <img> → одиночныйImg = 1",
        input: imgInput,
        output: JSON.stringify(out),
        ok: out.одиночныхImg === 1 && out.пар === 0,
      };
    })(),
    (() => {
      const out = profPhotoMarkup(decorFirstInput);
      return {
        name: "профиль: спейсер .gif 1×1 первым, затем пара и фото → декорация первой",
        input: decorFirstInput,
        output: JSON.stringify(out),
        ok:
          out.пар === 1 &&
          out.одиночныхImg === 2 &&
          out.одиночныхМелких === 1 &&
          out.одиночныхGif === 1 &&
          out.одиночныхДекор === 1 &&
          out.первый?.одиночный === true &&
          out.первый.декор === true &&
          out.одиночные[0].ширина === 1,
      };
    })(),
    (() => {
      const out = profPhotoMarkup(pairFirstInput);
      return {
        name: "профиль: пара первой, мелкий .gif после → декор = 1 (без двойного счёта), первый — пара",
        input: pairFirstInput,
        output: JSON.stringify(out),
        ok:
          out.одиночныхДекор === 1 &&
          out.одиночныхМелких === 1 &&
          out.одиночныхGif === 1 &&
          out.первый?.одиночный === false &&
          out.первый.декор === false,
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
      output: JSON.stringify(d1Forms(d1Input)),
      ok: d1Forms(d1Input).сТочкой && !d1Forms(d1Input).безТочки,
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

  // ── кейсы инвентаризации (д6–д8, признаки картинок, правило анонса) — буквальный вход и выход ──
  const d6Absorbed = [
    { relFile: "2023/0626.html", date: "2023-06-26" },
    { relFile: "2023/0630.html", date: "2023-06-30" },
  ];
  const d7Teaser = `<p>Текст тизерной страницы, который становится телом записи.</p>`;
  const d7Text = `<p>${"Самостоятельная страница с собственным текстом длиннее порога. ".repeat(10)}</p>`;
  const d7Photos = `<p><a href="javascript:window.open('bg/1.jpg')"><img src="sm/1.jpg"></a>Кликните на фото для увеличения</p>`;
  const d7Absorbed = [
    { relFile: "2023/0626.html", url: `${SITE}/2023/0626`, bodyHtml: d7Teaser },
    { relFile: "2023/0630.html", url: `${SITE}/2023/0630`, bodyHtml: d7Text },
    { relFile: "2023/0625.html", url: `${SITE}/2023/0625`, bodyHtml: d7Photos },
  ];
  const d8Body =
    `InstanceBeginEditable name="Edit02" --> ФЕСТИВАЛЬ ТЕННИСНЫХ ГОРОДОВ "Фестиваль Теннисных ` +
    `Городов" (Санкт-Петербург, 23-25 июня 2023 г.) успешно завершён! Опубликовано 26 июня 2023 г. ` +
    `"Фестиваль Теннисных Городов" проходил в Санкт-Петербурге.`;
  const d8Titles = [
    `"Фестиваль Теннисных Городов"-23 успешно завершён!`,
    `"Фестиваль теннисных городов" успешно завершён!`,
  ];
  const d8Plain = "Обычная новость о турнире выходного дня. Опубликовано: 20.03.2022";
  const repeatedInput = [["a.jpg", "b.jpg"], ["a.jpg"], ["a.jpg?x=1", "c.jpg"], ["b.jpg"]];
  const excerptSentences = "Первое предложение. Второе предложение здесь. Третье.";
  const excerptLongFirst =
    "Очень длинное первое предложение без единой точки внутри которое не помещается";

  const invCases: Array<{ name: string; input: string; output: string; ok: boolean }> = [
    (() => {
      const out = profD6(d6Absorbed, "2023/0626.html", "2023-05-26");
      return {
        name: "инвентаризация: д6 — лента 26.05.2023, тизер 26.06.2023 → Δ=31, бакет 31–60; галерейная 30.06 → 35",
        input: JSON.stringify({
          absorbed: d6Absorbed,
          teaser: "2023/0626.html",
          date: "2023-05-26",
        }),
        output: JSON.stringify(out) + ` бакет=${profD6Bucket(out.дельта ?? -1)}`,
        ok:
          out.страница === "2023/0626.html" &&
          out.датаСтраницы === "2023-06-26" &&
          out.дельта === 31 &&
          out.флаг &&
          profD6Bucket(31) === "31–60" &&
          out.поСтраницам[1].дельта === 35,
      };
    })(),
    (() => {
      const out = profD6(d6Absorbed, "2023/0626.html", "2023-06-26");
      return {
        name: "инвентаризация: д6 — даты совпадают → Δ=0, флаг false",
        input: JSON.stringify({
          absorbed: d6Absorbed,
          teaser: "2023/0626.html",
          date: "2023-06-26",
        }),
        output: JSON.stringify(out),
        ok: out.дельта === 0 && !out.флаг && profD6Bucket(0) === "0",
      };
    })(),
    (() => {
      const out = profD7(d7Absorbed, "2023/0626.html");
      return {
        name: "инвентаризация: д7 — тизер исключён, страница с текстом ≥500 считается, фото-страница нет",
        input: JSON.stringify(
          d7Absorbed.map((a) => ({ relFile: a.relFile, len: a.bodyHtml.length })),
        ),
        output: JSON.stringify(out),
        ok:
          out.страниц === 1 &&
          out.страницы[0].relFile === "2023/0630.html" &&
          out.страницы[0].длина >= D7_THRESHOLD &&
          out.суммаДлин === out.страницы[0].длина,
      };
    })(),
    (() => {
      const out = profD8(d8Body, d8Titles);
      return {
        name: "инвентаризация: д8 — остаток Dreamweaver и баннер сняты, полный заголовок не совпал (а=false), голова совпала (нестрого), «Опубликовано … г.» есть (б)",
        input: `тело: ${d8Body} | заголовки: ${d8Titles.join(" || ")}`,
        output: JSON.stringify(out),
        ok: !out.а && out.аНестрого && out.б,
      };
    })(),
    (() => {
      const out = profD8(d8Plain, ["Турнир выходного дня"]);
      return {
        name: "инвентаризация: д8 — обычное тело: (а) false, «Опубликовано: дд.мм.гггг» не считается (б)",
        input: `тело: ${d8Plain} | заголовки: Турнир выходного дня`,
        output: JSON.stringify(out),
        ok: !out.а && !out.аНестрого && !out.б,
      };
    })(),
    (() => {
      const out = profRepeatedSrcKeys(repeatedInput, 3);
      return {
        name: "инвентаризация: повторяющийся src — a.jpg в трёх записях (query отброшен), b.jpg в двух — нет",
        input: JSON.stringify(repeatedInput),
        output: JSON.stringify([...out]),
        ok: out.size === 1 && out.has("a.jpg"),
      };
    })(),
    {
      name: "инвентаризация: признак logos/ — по пути src",
      input: `http://tennisfed.spb.ru/logos/spb.gif | news/2010/foto.jpg | http://x/Logos/a.png`,
      output: JSON.stringify([
        isLogoSrc("http://tennisfed.spb.ru/logos/spb.gif"),
        isLogoSrc("news/2010/foto.jpg"),
        isLogoSrc("http://x/Logos/a.png"),
      ]),
      ok:
        isLogoSrc("http://tennisfed.spb.ru/logos/spb.gif") &&
        !isLogoSrc("news/2010/foto.jpg") &&
        !isLogoSrc("http://x/Logos/a.png"),
    },
    (() => {
      const out = excerptFromBody(excerptSentences, 50);
      return {
        name: "инвентаризация: анонс по границе предложения — два предложения в 50 знаков, третье не влезло",
        input: `${excerptSentences} | N=50`,
        output: JSON.stringify(out),
        ok: out.текст === "Первое предложение. Второе предложение здесь." && !out.поСлову,
      };
    })(),
    (() => {
      const out = excerptFromBody(excerptLongFirst, 30);
      return {
        name: "инвентаризация: анонс — первое предложение длиннее порога → по границе слова с многоточием, итог ≤ N",
        input: `${excerptLongFirst} | N=30`,
        output: JSON.stringify(out),
        ok: out.текст === "Очень длинное первое…" && out.поСлову && out.текст.length <= 30,
      };
    })(),
    (() => {
      const out = excerptFromBody("   ", 150);
      return {
        name: "инвентаризация: анонс — пустое тело → пустая строка",
        input: `"   " | N=150`,
        output: JSON.stringify(out),
        ok: out.текст === "" && !out.поСлову,
      };
    })(),
  ];
  for (const c of invCases) {
    if (!c.ok) failed += 1;
    console.log(`[${c.ok ? "OK" : "FAIL"}] ${c.name}`);
    console.log(`  вход:  ${c.input}`);
    console.log(`  выход: ${c.output}`);
  }

  // ── кейсы чистки архива (A1–A5): буквальный вход и выход через боевые функции ──
  const videoCtx: SanitizeCtx = { baseUrl: `${SITE}/news.html`, videoLinks: true };
  const dataTableInput =
    `<table border="1" style="x"><tr><th style="a" colspan="2">Итог</th></tr>` +
    `<tr><td onclick="steal()"><font color="red">1</font></td>` +
    `<td><div align="center"><strong>С. Кузнецова</strong></div></td></tr></table>`;
  const dataTableExpected = `<table><tr><th colspan="2">Итог</th></tr><tr><td>1</td><td><strong>С. Кузнецова</strong></td></tr></table>`;
  const sectionsTableInput =
    `<table><caption>Итоги</caption><thead><tr><th>№</th><th>Очки</th></tr></thead>` +
    `<tbody><tr><td><span class="x">1</span></td><td>30<img src="a.gif"></td></tr></tbody></table>`;
  const sectionsTableExpected = `<table><caption>Итоги</caption><thead><tr><th>№</th><th>Очки</th></tr></thead><tbody><tr><td>1</td><td>30</td></tr></tbody></table>`;
  const layoutTableInput = `<table><tr><td>первый абзац текста</td><td>второй абзац</td></tr></table>`;
  const nestedDataInput = `<table><tr><td>1</td><td><table><tr><td>2</td></tr></table></td></tr></table>`;
  const iframeInput = `<p>Смотрите ролик<br><iframe width="420" src="https://www.youtube.com/embed/mh6TPzzAq30" frameborder="0" allowfullscreen></iframe></p>`;
  const videoAnchor = `<a href="https://www.youtube.com/embed/mh6TPzzAq30">Видео</a>`;
  const orphanInput = "a<!-- x -->b -->c";
  const regionInput = `<html><!-- InstanceBeginEditable name="Edit02" -->\r\n<p>тело</p>\r\n<!-- InstanceEndEditable --></div>`;
  const noMarkersInput = `<td width="821"><p>x</p>`;
  const lit = (name: string, input: string, output: string, expected: string) => ({
    name,
    input,
    output,
    ok: output === expected,
  });

  const cleanupCases: Array<{ name: string; input: string; output: string; ok: boolean }> = [
    lit(
      "чистка: «&hellip» без точки с запятой в конце заголовка → «…»",
      "ЛИХОВЦЕВОЙ&hellip",
      stripTags("ЛИХОВЦЕВОЙ&hellip"),
      "ЛИХОВЦЕВОЙ…",
    ),
    lit(
      "чистка: «&hellip» в середине текста → «…»",
      "И ОПЯТЬ&hellip ИТОГИ",
      stripTags("И ОПЯТЬ&hellip ИТОГИ"),
      "И ОПЯТЬ… ИТОГИ",
    ),
    lit(
      "чистка: «&hellip;» с точкой с запятой → «…»",
      "ИТОГИ&hellip;",
      stripTags("ИТОГИ&hellip;"),
      "ИТОГИ…",
    ),
    lit(
      "чистка: «&hellipsis» — не сущность, остаётся",
      "см. &hellipsis дальше",
      stripTags("см. &hellipsis дальше"),
      "см. &hellipsis дальше",
    ),
    lit("чистка: «P&G» остаётся", "P&G", stripTags("P&G"), "P&G"),
    lit(
      "чистка: «&laquo» без точки с запятой → «",
      "&laquoСПОРТ&raquo",
      stripTags("&laquoСПОРТ&raquo"),
      "«СПОРТ»",
    ),
    lit(
      "чистка: неизвестное имя «&foo» остаётся в обеих формах",
      "a &foo b &foo; c",
      stripTags("a &foo b &foo; c"),
      "a &foo b &foo; c",
    ),
    lit(
      "чистка: числовые формы «&#149;» → «•», «&#8230;» → «…», «&#x2026» → «…»",
      "a&#149;b &#8230; c&#x2026",
      stripTags("a&#149;b &#8230; c&#x2026"),
      "a•b … c…",
    ),
    (() => {
      const out = blankComments(orphanInput);
      return {
        name: "чистка: осиротевший «-->» затирается, парный комментарий — целиком, длина прежняя",
        input: orphanInput,
        output: JSON.stringify(out),
        ok:
          !out.includes("-->") &&
          !out.includes("<!--") &&
          out.length === orphanInput.length &&
          out.replace(/\s+/g, " ") === "a b c",
      };
    })(),
    lit(
      "чистка: регион article без хвостов комментариев маркеров",
      regionInput,
      JSON.stringify(articleRegion(regionInput)),
      JSON.stringify("\r\n<p>тело</p>\r\n"),
    ),
    lit(
      'чистка: article без маркеров — от <td width="821" до конца',
      noMarkersInput,
      articleRegion(noMarkersInput),
      noMarkersInput,
    ),
    lit(
      "чистка: таблица данных остаётся таблицей (colspan), без style/onclick/font",
      dataTableInput,
      sanitizeBody(dataTableInput, ctx),
      dataTableExpected,
    ),
    lit(
      "чистка: caption/thead/tbody сохраняются, span и img внутри ячеек — нет",
      sectionsTableInput,
      sanitizeBody(sectionsTableInput, ctx),
      sectionsTableExpected,
    ),
    lit(
      "чистка: макетная таблица разворачивается в абзацы",
      layoutTableInput,
      sanitizeBody(layoutTableInput, ctx),
      "<p>первый абзац текста</p>\n<p>второй абзац</p>",
    ),
    lit(
      "чистка: таблица данных с вложенной таблицей разворачивается (вложенная без своих вложенных — остаётся)",
      nestedDataInput,
      sanitizeBody(nestedDataInput, ctx),
      "<p>1</p>\n<table><tr><td>2</td></tr></table>",
    ),
    (() => {
      const out = sanitizeBody(iframeInput, videoCtx);
      return {
        name: "чистка: iframe → ссылка «Видео» в теле",
        input: iframeInput,
        output: out,
        ok:
          out.includes(videoAnchor) &&
          !out.includes("iframe") &&
          stripTags(out) === "Смотрите ролик Видео",
      };
    })(),
    lit(
      "чистка: iframe без videoLinks выброшен (путь анонса)",
      iframeInput,
      sanitizeBody(iframeInput, ctx),
      "<p>Смотрите ролик</p>",
    ),
    ...(() => {
      const banner =
        `\r\n      <p class="Header_BlueBack"><marquee behavior="alternate" direction="right"> <span style="color:#f25100">` +
        `<a href=http://www.tennisfed.spb.ru/festvest.html>ФЕСТИВАЛЬ ТЕННИСНЫХ ГОРОДОВ</a></span></marquee></p>\r\n`;
      const headerTitle = `<p align=center class=lgtxt>\r\nЗаголовок страницы\r\n<br />\r\nвторая строка\r\n`;
      const published = `<p class=mdtxt align=right><i>Опубликовано\r\n<br>\r\n30 августа 2023 г.\r\n</i>\r\n<br />\r\n`;
      const updated = `<p class=mdtxt align=right><i>Обновлено\r\n<br>\r\n21 февраля 2024 г.\r\n</i>\r\n`;
      const numeric = `<p class=mdtxt align=right><i>Опубликовано\r\n<br>\r\n20.03.2022\r\n</i>\r\n`;
      const text = `<p class=mdtxt align=left>\r\nТекст статьи.`;
      const repeatPara = `<p align=center>\r\nЗаголовок страницы\r\n<br />\r\nвторая строка\r\n`;
      const leadPara = `<p align=center>\r\nЗаголовок страницы вторая строка открыта для всех.\r\n`;
      const c1 = cutArticleHeader(banner + headerTitle + published + text);
      const c2 = cutArticleHeader(banner + headerTitle + updated + text);
      const c3 = cutArticleHeader(banner + headerTitle + numeric + text);
      const c4 = cutArticleHeader(banner + headerTitle + text);
      const c5 = cutArticleHeader(banner + headerTitle + published + repeatPara + text);
      const c6 = cutArticleHeader(banner + headerTitle + published + leadPara + text);
      return [
        {
          name: "чистка: шапка article (баннер, заголовок, «Опубликовано … г.») срезана до текста",
          input: JSON.stringify(banner + headerTitle + published + text),
          output: JSON.stringify(c1),
          ok: c1.html === text && c1.cut && !c1.repeat,
        },
        {
          name: "чистка: «Обновлено … г.» и «Опубликовано 20.03.2022» — тоже шапка",
          input: JSON.stringify([updated, numeric]),
          output: JSON.stringify([c2, c3]),
          ok: c2.html === text && c2.cut && c3.html === text && c3.cut,
        },
        {
          name: "чистка: без строки публикации шапка не режется",
          input: JSON.stringify(banner + headerTitle + text),
          output: JSON.stringify(c4),
          ok: c4.html === banner + headerTitle + text && !c4.cut,
        },
        {
          name: "чистка: точный повтор заголовка после строки публикации срезан, лид с теми же словами — нет",
          input: JSON.stringify([repeatPara, leadPara]),
          output: JSON.stringify([c5, c6]),
          ok: c5.html === text && c5.repeat && c6.html === leadPara + text && c6.cut && !c6.repeat,
        },
      ];
    })(),
  ];
  for (const c of cleanupCases) {
    if (!c.ok) failed += 1;
    console.log(`[${c.ok ? "OK" : "FAIL"}] ${c.name}`);
    console.log(`  вход:  ${c.input}`);
    console.log(`  выход: ${c.output}`);
  }

  const total = cases.length + profCases.length + invCases.length + cleanupCases.length;
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
