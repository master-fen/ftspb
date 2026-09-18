import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { sortManifestPreloads } from "./ssr-snapshot";

/**
 * Выравнивание снимков при правке, которая меняет разметку.
 *
 * Запуск:
 *   bun scripts/snapshot-align.ts КАТАЛОГ_A КАТАЛОГ_B ОЖИДАНИЕ.json [НАЧАЛО КОНЕЦ]
 *
 * ОЖИДАНИЕ.json: { "страница": [изменённых, вставок], … }; страниц нет в файле —
 * ожидается 0/0. НАЧАЛО и КОНЕЦ — маркеры области; умолчание — значения #79.
 *
 * Выравнивание — два прохода, без среза общих концов (жадный срез ломал
 * выравнивание при повторяющихся блоках: меню и «то же меню минус пункт»):
 *   1) LCS по точному тексту строки; строка манифеста — одна строка при любом
 *      содержимом (ключ-константа);
 *   2) внутри каждого промежутка между якорями прохода 1 — LCS по ключу без
 *      class (class="…" опустошается, кроме class="$tsr").
 * Пары с разным текстом: манифест — «только порядок» (после сортировки
 * preloads совпал) или «состав» (добавленные и убранные записи preloads; если
 * массивы как мультимножества равны, а строка различна — «манифест: иное»,
 * это остаток); прочие — «изменён class». Строки A без пары — удаления
 * (обязаны быть 0), строки B без пары — вставки. Изменённые class и вставки
 * обязаны лежать в области.
 *
 * Код выхода: 0 — все страницы по ожиданию; 1 — расхождение (в том числе
 * страница только на одной стороне); 2 — ошибка входа или вызова (нет
 * аргументов, нет каталога, ни одного .html на какой-либо стороне, нет или
 * не разобран файл ожиданий). Раньше
 * отсутствующий вход ронял скрипт необработанным исключением с кодом 1 —
 * неотличимо от расхождения.
 */

const MANIFEST = '<script class="$tsr" id="$tsr-stream-barrier">';

export const EXIT_OK = 0;
export const EXIT_DIFF = 1;
export const EXIT_INPUT = 2;
const USAGE =
  "вызов: bun scripts/snapshot-align.ts КАТАЛОГ_A КАТАЛОГ_B ОЖИДАНИЕ.json [НАЧАЛО КОНЕЦ]";

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
const CLASS = / class="(?!\$tsr")[^"]*"/g;
/** Ключ строки манифеста в LCS: символ, которого в разметке не бывает. */
const MANIFEST_KEY = String.fromCharCode(0) + "MANIFEST";

export type Region = { start: string; end: string };

/** Умолчание области — значения #79. */
export const DEFAULT_REGION: Region = {
  start: '<div class="min-w-0 lg:order-1 lg:col-span-2">',
  end: "</main>",
};

const strip = (l: string) => l.replace(CLASS, ' class=""');
const keyRaw = (l: string) => (l.startsWith(MANIFEST) ? MANIFEST_KEY : l);
const keyStripped = (l: string) => (l.startsWith(MANIFEST) ? MANIFEST_KEY : strip(l));

function lcs(ka: string[], kb: string[]): [number, number][] {
  const n = ka.length;
  const m = kb.length;
  const W = m + 1;
  const dp = new Int32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i * W + j] =
        ka[i] === kb[j]
          ? dp[(i + 1) * W + j + 1] + 1
          : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
    else j++;
  }
  return pairs;
}

export function align(a: string[], b: string[]): [number, number][] {
  const anchors = lcs(a.map(keyRaw), b.map(keyRaw));
  const pairs: [number, number][] = [];
  let pa = -1;
  let pb = -1;
  for (const [x, y] of [...anchors, [a.length, b.length] as [number, number]]) {
    const ga = a.slice(pa + 1, x);
    const gb = b.slice(pb + 1, y);
    for (const [i, j] of lcs(ga.map(keyStripped), gb.map(keyStripped)))
      pairs.push([pa + 1 + i, pb + 1 + j]);
    if (x < a.length) pairs.push([x, y]);
    pa = x;
    pb = y;
  }
  return pairs;
}

function preloadEntries(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/preloads:\$R\[\d+\]=\[([^\]]*)\]/g))
    if (m[1] !== "") out.push(...m[1].split(","));
  return out;
}

function multisetDiff(a: string[], b: string[]): { added: string[]; removed: string[] } {
  const count = new Map<string, number>();
  for (const x of a) count.set(x, (count.get(x) ?? 0) + 1);
  const added: string[] = [];
  for (const x of b) {
    const c = count.get(x) ?? 0;
    if (c > 0) count.set(x, c - 1);
    else added.push(x);
  }
  const removed: string[] = [];
  for (const [x, c] of count) for (let i = 0; i < c; i++) removed.push(x);
  return { added: added.sort(), removed: removed.sort() };
}

function findRegion(lines: string[], region: Region): [number, number] {
  const s = lines.findIndex((l) => l.startsWith(region.start));
  const e = lines.findIndex((l, i) => i > s && l.startsWith(region.end));
  return [s, e];
}

export type Verdict = {
  changed: number;
  inserted: number;
  deleted: number;
  manifestOrder: number;
  manifestComposition: { added: string[]; removed: string[] } | null;
  problems: string[];
};

export function compare(a: string[], b: string[], region: Region = DEFAULT_REGION): Verdict {
  const pairs = align(a, b);
  const pairedA = new Set(pairs.map(([x]) => x));
  const pairedB = new Set(pairs.map(([, y]) => y));
  const [ra0, ra1] = findRegion(a, region);
  const [rb0, rb1] = findRegion(b, region);
  // Ненайденный маркер — отказ, а не «всё вне области»: пропущенный конец даёт
  // e = -1 и загоняет в проблемы каждую изменённую строку, пропущенное начало
  // даёт s = -1 и МОЛЧА расширяет область до всего перед концом. Оба случая
  // неотличимы от настоящего результата, если маркер не проверять.
  const missing = [
    ra0 < 0 ? `начало «${region.start}» (A)` : "",
    ra1 < 0 ? `конец «${region.end}» (A)` : "",
    rb0 < 0 ? `начало «${region.start}» (B)` : "",
    rb1 < 0 ? `конец «${region.end}» (B)` : "",
  ].filter(Boolean);
  const v: Verdict = {
    changed: 0,
    inserted: b.length - pairedB.size,
    deleted: a.length - pairedA.size,
    manifestOrder: 0,
    manifestComposition: null,
    problems: missing.length > 0 ? [`маркер области не найден: ${missing.join("; ")}`] : [],
  };
  for (const [x, y] of pairs) {
    if (a[x] === b[y]) continue;
    if (a[x].startsWith(MANIFEST)) {
      if (sortManifestPreloads(a[x]) === sortManifestPreloads(b[y])) {
        v.manifestOrder++;
        continue;
      }
      const d = multisetDiff(preloadEntries(a[x]), preloadEntries(b[y]));
      if (d.added.length === 0 && d.removed.length === 0)
        v.problems.push(`манифест: иное (не preloads) A:${x + 1}`);
      else v.manifestComposition = d;
      continue;
    }
    v.changed++;
    if (missing.length === 0 && !(x > ra0 && x < ra1 && y > rb0 && y < rb1))
      v.problems.push(`изменён class вне области: A:${x + 1} B:${y + 1}`);
  }
  for (let y = 0; y < b.length; y++)
    if (missing.length === 0 && !pairedB.has(y) && !(y > rb0 && y < rb1))
      v.problems.push(`вставка вне области: B:${y + 1}: ${b[y].slice(0, 100)}`);
  for (let x = 0; x < a.length; x++)
    if (!pairedA.has(x)) v.problems.push(`удалена строка A:${x + 1}: ${a[x].slice(0, 100)}`);
  return v;
}

/**
 * Файл ожиданий: страница → [изменённых, вставок]. Здесь единственный читатель
 * этого формата; писатель — scripts/snapshot-locate.ts в режиме --expect.
 */
export type Expectations = Record<string, [number, number]>;

export function parseExpectations(text: string): Expectations {
  return JSON.parse(text) as Expectations;
}

/** Точка входа: возвращает код процесса (EXIT_OK / EXIT_DIFF / EXIT_INPUT). */
export function main(argv: string[], out: (line: string) => void, err: (line: string) => void) {
  const [dirA, dirB, expPath, rs, re] = argv;
  if (!dirA || !dirB || !expPath || argv.length > 5) {
    err(USAGE);
    return EXIT_INPUT;
  }
  for (const d of [dirA, dirB])
    if (!isDir(d)) {
      err(`нет каталога ${d}`);
      return EXIT_INPUT;
    }
  if (!fs.existsSync(expPath) || fs.statSync(expPath).isDirectory()) {
    err(`нет файла ожиданий ${expPath}`);
    return EXIT_INPUT;
  }
  let exp: Expectations;
  try {
    exp = parseExpectations(fs.readFileSync(expPath, "utf8"));
  } catch (e) {
    err(`файл ожиданий не разобран ${expPath}: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT_INPUT;
  }
  // Ноль страниц с любой стороны — сравнивать нечего: «страниц: 0» с кодом 0
  // было бы совпадением ни о чём.
  for (const d of [dirA, dirB])
    if (!fs.readdirSync(d).some((n) => n.endsWith(".html"))) {
      err(`нет ни одного .html в ${d}`);
      return EXIT_INPUT;
    }
  const region: Region = { start: rs || DEFAULT_REGION.start, end: re || DEFAULT_REGION.end };
  out(`область: начало «${region.start}», конец «${region.end}»`);
  const names = [...new Set([...fs.readdirSync(dirA), ...fs.readdirSync(dirB)])]
    .filter((n) => n.endsWith(".html"))
    .sort();
  let bad = 0;
  let good = 0;
  let totalC = 0;
  let totalI = 0;
  let totalD = 0;
  let totalOrder = 0;
  const perPage: string[] = [];
  const compositions = new Map<string, string[]>();
  for (const n of names) {
    const page = n.replace(/\.html$/, "");
    // Страница только на одной стороне — расхождение состава, не исключение.
    const missingSide = !fs.existsSync(path.join(dirA, n))
      ? "A"
      : !fs.existsSync(path.join(dirB, n))
        ? "B"
        : null;
    if (missingSide) {
      bad++;
      out(`расхождение ${page}: нет файла на стороне ${missingSide}`);
      continue;
    }
    const v = compare(
      fs.readFileSync(path.join(dirA, n), "utf8").split("\n"),
      fs.readFileSync(path.join(dirB, n), "utf8").split("\n"),
      region,
    );
    const [eC, eI] = exp[page] ?? [0, 0];
    totalC += v.changed;
    totalI += v.inserted;
    totalD += v.deleted;
    totalOrder += v.manifestOrder;
    if (page in exp) perPage.push(`${page} ${v.changed}/${v.inserted}`);
    if (v.manifestComposition) {
      const k = `+[${v.manifestComposition.added.join(" ")}] −[${v.manifestComposition.removed.join(" ")}]`;
      compositions.set(k, [...(compositions.get(k) ?? []), page]);
      if (!(page in exp)) v.problems.push("состав манифеста изменился на странице вне списка (а)");
    }
    if (v.changed === eC && v.inserted === eI && v.deleted === 0 && v.problems.length === 0) good++;
    else {
      bad++;
      out(
        `расхождение ${page}: изменено ${v.changed} (ожидалось ${eC}), вставок ${v.inserted} (ожидалось ${eI}), удалений ${v.deleted}`,
      );
      for (const pr of v.problems.slice(0, 10)) out(`  ${pr}`);
    }
  }
  out(`страницы списка (а), изменено/вставок: ${perPage.join("; ")}`);
  for (const [k, pages] of compositions)
    out(`состав манифеста ${k}: ${pages.length} стр. — ${pages.join(", ")}`);
  out(
    `страниц: ${names.length}; по ожиданию: ${good}; с расхождением: ${bad}; изменённых class всего: ${totalC}; ` +
      `вставок всего: ${totalI}; удалений всего: ${totalD}; строк манифеста «только порядок»: ${totalOrder}; ` +
      `страниц со сменой состава манифеста: ${[...compositions.values()].flat().length}`,
  );
  return bad ? EXIT_DIFF : EXIT_OK;
}

if (import.meta.main) process.exit(main(process.argv.slice(2), console.log, console.error));
