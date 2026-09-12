import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * SSR-снимки публичных страниц — для сравнения «до/после» правок вёрстки.
 *
 * Запуск:
 *   bun scripts/ssr-snapshot.ts snap БАЗОВЫЙ_URL КАТАЛОГ [--class-map ФАЙЛ.json]
 *   bun scripts/ssr-snapshot.ts classify КАТАЛОГ_A КАТАЛОГ_B
 *
 * Страницы — все <loc> из БАЗОВЫЙ_URL/sitemap.xml (берётся только путь: в
 * карте абсолютные адреса боевого домена) плюс фиксированный набор страниц,
 * которых в карте нет (заглушки с noindex, /federation, несуществующая
 * новость — у неё ожидается 404, см. EXTRA_PATHS). На каждую страницу
 * пишутся ИМЯ.html — нормализованная разметка — и ИМЯ.preloads.txt — пути
 * modulepreload/preload. Каталоги сравниваются так:
 *   git diff --no-index --text --stat КАТАЛОГ_A КАТАЛОГ_B
 *
 * Нормализация убирает только то, что меняется от сборки к сборке или от
 * запроса к запросу при той же разметке (хэши ассетов, id потока, путь к
 * исходнику в dev-атрибуте). Списки preload не выбрасываются, а выносятся в
 * отдельный файл: переезд чанков должен быть виден, но не топить diff разметки.
 *
 * classify раскладывает различия пары каталогов по файлам: «совпали»,
 * «только манифест» (различаются только строки встроенного манифеста роутера,
 * и после сортировки массивов preloads они совпадают) и «прочее» — всё
 * остальное, с номерами строк. Код выхода 1, если «прочее» непусто.
 */

export type NormalizeOptions = {
  /** Токен класса → строка токенов, на которую он разворачивается. */
  classMap?: Record<string, string>;
};

/**
 * Страницы вне sitemap.xml → ожидаемый HTTP-статус. Заглушки с noindex и
 * /federation — 200; несуществующая новость — 404: её notFoundComponent
 * рисуется под рамой _site, и вид этой страницы тоже должен попадать в снимок.
 * Страницы из sitemap.xml ожидаются с 200.
 */
const EXTRA_PATHS: Record<string, number> = {
  "/federation/about": 200,
  "/referees": 200,
  "/teams": 200,
  "/tournaments": 200,
  "/courts": 200,
  "/contacts": 200,
  "/privacy": 200,
  "/terms": 200,
  "/federation": 200,
  "/news/nesuschestvuyuschiy-slug-dlya-snimka": 404,
};

/** Текст отказа, если статус ответа не тот, что ожидался; иначе null. */
export function statusMismatch(url: string, status: number, expected: number): string | null {
  return status === expected ? null : `${url} → HTTP ${status}, ожидался ${expected}`;
}

const PRELOAD_LINE = /rel="(?:modulepreload|preload)"/;

function splitTokens(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

export function normalizeHtml(
  html: string,
  options: NormalizeOptions = {},
): { html: string; preloads: string[] } {
  const split = html
    // 1) хэш сборки в имени ассета: /assets/ИМЯ-ХЭШ.РАСШ → /assets/ИМЯ-HASH.РАСШ
    .replace(/(\/assets\/[^"'\s/?#]+?)-[A-Za-z0-9_-]{8}(\.[A-Za-z0-9]+)/g, "$1-HASH$2")
    // 2) id потока SSR
    .replace(/u:\d{13}/g, "u:STREAM")
    // 3) путь к исходнику из dev-сборки
    .replace(/\s+data-tsd-source="[^"]*"/g, "")
    // 4) по тегу на строку
    .replace(/></g, ">\n<");

  // 5) preload-ссылки — в отдельный список
  const preloads = new Set<string>();
  const kept: string[] = [];
  for (const line of split.split("\n")) {
    if (PRELOAD_LINE.test(line)) {
      preloads.add(/href="([^"]*)"/.exec(line)?.[1] ?? line);
    } else {
      kept.push(line);
    }
  }
  let out = kept.join("\n");

  // 6) только с картой: разворот токенов и сортировка внутри class="..."
  const { classMap } = options;
  if (classMap) {
    out = out.replace(/class="([^"]*)"/g, (_, value: string) => {
      const tokens = splitTokens(value).flatMap((token) =>
        Object.hasOwn(classMap, token) ? splitTokens(classMap[token]) : [token],
      );
      tokens.sort();
      return `class="${tokens.join(" ")}"`;
    });
  }

  return { html: out, preloads: [...preloads].sort() };
}

/** Путь страницы → имя файла снимка: «/» → index, остальное — «/» на «__». */
export function fileNameForPath(pagePath: string): string {
  const trimmed = pagePath.replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "index" : trimmed.replaceAll("/", "__");
}

/** Строка встроенного манифеста роутера: правило 4 ставит тег на свою строку, скрипт в ней целиком. */
const MANIFEST_LINE_PREFIX = '<script class="$tsr" id="$tsr-stream-barrier">';

/** Массив preloads в манифесте: preloads:$R[N]=["/assets/…",…]. */
const PRELOADS_ARRAY = /(preloads:\$R\[\d+\]=\[)([^\]]*)\]/g;

/**
 * Строка манифеста с отсортированными элементами каждого массива preloads.
 * Порядок элементов — не сигнал: смена хэша одного чанка переставляет массив.
 * Совпадение после сортировки НЕ доказывает тождество состава: после
 * нормализации чанки одного маршрута (…_newsId-HASH.js ×3) неразличимы —
 * состав доказывается листингом файлов обеих сборок.
 */
export function sortManifestPreloads(line: string): string {
  return line.replace(PRELOADS_ARRAY, (_, head: string, body: string) => {
    const items = body === "" ? [] : body.split(",");
    return `${head}${items.sort().join(",")}]`;
  });
}

export type PairVerdict =
  | { kind: "same" }
  | { kind: "manifest"; lines: number[] }
  | { kind: "other"; reason: string; lines: number[]; manifestLines: number[] };

/**
 * Пара нормализованных файлов снимка, сравнение по позициям строк.
 * «manifest» — каждая различающаяся строка на обеих сторонах — строка
 * манифеста, и после sortManifestPreloads они совпадают; иначе «other»:
 * lines — строки вне этого правила, manifestLines — строки манифеста,
 * различные только порядком preloads (отделены, а не спрятаны).
 */
export function classifyPair(a: string, b: string): PairVerdict {
  if (a === b) return { kind: "same" };
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  if (linesA.length !== linesB.length) {
    return {
      kind: "other",
      reason: `строк ${linesA.length} и ${linesB.length}`,
      lines: [],
      manifestLines: [],
    };
  }
  const manifest: number[] = [];
  const other: number[] = [];
  for (let i = 0; i < linesA.length; i++) {
    const lineA = linesA[i];
    const lineB = linesB[i];
    if (lineA === lineB) continue;
    const onlyOrder =
      lineA.startsWith(MANIFEST_LINE_PREFIX) &&
      lineB.startsWith(MANIFEST_LINE_PREFIX) &&
      sortManifestPreloads(lineA) === sortManifestPreloads(lineB);
    (onlyOrder ? manifest : other).push(i + 1);
  }
  return other.length === 0
    ? { kind: "manifest", lines: manifest }
    : {
        kind: "other",
        reason: "различие не в порядке preloads",
        lines: other,
        manifestLines: manifest,
      };
}

// ───────────────────────── запуск ─────────────────────────

function fail(message: string): never {
  console.error(`Отказ: ${message}`);
  process.exit(1);
}

const USAGE =
  "вызов: bun scripts/ssr-snapshot.ts snap БАЗОВЫЙ_URL КАТАЛОГ [--class-map ФАЙЛ.json]" +
  " | classify КАТАЛОГ_A КАТАЛОГ_B";

type Args =
  | { command: "snap"; baseUrl: string; outDir: string; classMapPath?: string }
  | { command: "classify"; dirA: string; dirB: string };

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let classMapPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--class-map") {
      classMapPath = argv[++i];
      if (!classMapPath) fail("после --class-map нужен путь к файлу");
    } else if (arg.startsWith("--")) {
      fail(`неизвестный аргумент: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  const [command, ...rest] = positional;
  if (command === "classify") {
    if (rest.length !== 2 || classMapPath) fail(USAGE);
    return { command, dirA: rest[0], dirB: rest[1] };
  }
  const [baseUrl, outDir, ...extra] = rest;
  if (command !== "snap" || !baseUrl || !outDir || extra.length > 0) fail(USAGE);
  return { command, baseUrl: baseUrl.replace(/\/+$/, ""), outDir, classMapPath };
}

function readClassMap(file: string): Record<string, string> {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fail(`${file}: карта классов должна быть объектом «токен → строка токенов»`);
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") fail(`${file}: значение для «${key}» — не строка`);
  }
  return parsed as Record<string, string>;
}

async function fetchText(url: string, expected = 200): Promise<string> {
  const res = await fetch(url);
  const mismatch = statusMismatch(url, res.status, expected);
  if (mismatch) fail(mismatch);
  return res.text();
}

function classifyDirs(dirA: string, dirB: string): number {
  for (const dir of [dirA, dirB]) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail(`${dir}: нет такого каталога`);
  }
  const names = [...new Set([...fs.readdirSync(dirA), ...fs.readdirSync(dirB)])].sort();
  const counts = { same: 0, manifest: 0, other: 0 };
  let orderOnlyLines = 0;

  for (const name of names) {
    const fileA = path.join(dirA, name);
    const fileB = path.join(dirB, name);
    const missing = !fs.existsSync(fileA) ? dirA : !fs.existsSync(fileB) ? dirB : null;
    const verdict: PairVerdict = missing
      ? { kind: "other", reason: `нет в ${missing}`, lines: [], manifestLines: [] }
      : classifyPair(fs.readFileSync(fileA, "utf8"), fs.readFileSync(fileB, "utf8"));
    counts[verdict.kind]++;
    if (verdict.kind === "manifest") {
      orderOnlyLines += verdict.lines.length;
      console.log(`только манифест  ${name}  строки ${verdict.lines.join(", ")}`);
    } else if (verdict.kind === "other") {
      orderOnlyLines += verdict.manifestLines.length;
      const lines = verdict.lines.length > 0 ? `: строки ${verdict.lines.join(", ")}` : "";
      const order =
        verdict.manifestLines.length > 0
          ? `; манифест, только порядок: строки ${verdict.manifestLines.join(", ")}`
          : "";
      console.log(`прочее  ${name}  ${verdict.reason}${lines}${order}`);
    }
  }

  console.log(
    `файлов: ${names.length}; совпали: ${counts.same}; только манифест: ${counts.manifest}; ` +
      `прочее: ${counts.other}; строк манифеста, различных только порядком: ${orderOnlyLines}`,
  );
  return counts.other > 0 ? 1 : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "classify") {
    process.exit(classifyDirs(args.dirA, args.dirB));
  }
  const { baseUrl, outDir, classMapPath } = args;
  const classMap = classMapPath ? readClassMap(classMapPath) : undefined;

  // Снимок поверх старого смешал бы файлы двух сборок: пропавшая страница
  // осталась бы в каталоге от прошлого запуска и не дала бы различия.
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
    fail(`каталог ${outDir} не пуст`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const sitemap = await fetchText(`${baseUrl}/sitemap.xml`);
  const fromSitemap = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => new URL(m[1].trim()).pathname,
  );
  const extraPaths = Object.keys(EXTRA_PATHS);
  const pages = [...new Set([...fromSitemap, ...extraPaths])];

  for (const pagePath of pages) {
    const raw = await fetchText(`${baseUrl}${pagePath}`, EXTRA_PATHS[pagePath] ?? 200);
    const { html, preloads } = normalizeHtml(raw, { classMap });
    const name = fileNameForPath(decodeURIComponent(pagePath));
    fs.writeFileSync(path.join(outDir, `${name}.html`), html);
    fs.writeFileSync(path.join(outDir, `${name}.preloads.txt`), preloads.join("\n") + "\n");
  }

  console.log(
    `страниц: ${pages.length} (из sitemap.xml: ${fromSitemap.length}, фиксированных: ${extraPaths.length})` +
      `${classMap ? `, карта классов: ${classMapPath}` : ""} → ${outDir}`,
  );
}

if (import.meta.main) {
  await main();
}
