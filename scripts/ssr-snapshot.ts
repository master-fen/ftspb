import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * SSR-снимки публичных страниц — для сравнения «до/после» правок вёрстки.
 *
 * Запуск: bun scripts/ssr-snapshot.ts snap БАЗОВЫЙ_URL КАТАЛОГ [--class-map ФАЙЛ.json]
 *
 * Страницы — все <loc> из БАЗОВЫЙ_URL/sitemap.xml (берётся только путь: в
 * карте абсолютные адреса боевого домена) плюс фиксированный набор страниц,
 * которых в карте нет (заглушки с noindex, /federation). На каждую страницу
 * пишутся ИМЯ.html — нормализованная разметка — и ИМЯ.preloads.txt — пути
 * modulepreload/preload. Каталоги сравниваются так:
 *   git diff --no-index --text --stat КАТАЛОГ_A КАТАЛОГ_B
 *
 * Нормализация убирает только то, что меняется от сборки к сборке или от
 * запроса к запросу при той же разметке (хэши ассетов, id потока, путь к
 * исходнику в dev-атрибуте). Списки preload не выбрасываются, а выносятся в
 * отдельный файл: переезд чанков должен быть виден, но не топить diff разметки.
 */

export type NormalizeOptions = {
  /** Токен класса → строка токенов, на которую он разворачивается. */
  classMap?: Record<string, string>;
};

const EXTRA_PATHS = [
  "/federation/about",
  "/referees",
  "/teams",
  "/tournaments",
  "/courts",
  "/contacts",
  "/privacy",
  "/terms",
  "/federation",
];

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

// ───────────────────────── запуск ─────────────────────────

function fail(message: string): never {
  console.error(`Отказ: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
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

  const [command, baseUrl, outDir, ...rest] = positional;
  if (command !== "snap" || !baseUrl || !outDir || rest.length > 0) {
    fail("вызов: bun scripts/ssr-snapshot.ts snap БАЗОВЫЙ_URL КАТАЛОГ [--class-map ФАЙЛ.json]");
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), outDir, classMapPath };
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

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (res.status !== 200) fail(`${url} → HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const { baseUrl, outDir, classMapPath } = parseArgs(process.argv.slice(2));
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
  const pages = [...new Set([...fromSitemap, ...EXTRA_PATHS])];

  for (const pagePath of pages) {
    const raw = await fetchText(`${baseUrl}${pagePath}`);
    const { html, preloads } = normalizeHtml(raw, { classMap });
    const name = fileNameForPath(decodeURIComponent(pagePath));
    fs.writeFileSync(path.join(outDir, `${name}.html`), html);
    fs.writeFileSync(path.join(outDir, `${name}.preloads.txt`), preloads.join("\n") + "\n");
  }

  console.log(
    `страниц: ${pages.length} (из sitemap.xml: ${fromSitemap.length}, фиксированных: ${EXTRA_PATHS.length})` +
      `${classMap ? `, карта классов: ${classMapPath}` : ""} → ${outDir}`,
  );
}

if (import.meta.main) {
  await main();
}
