import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { sortManifestPreloads } from "./ssr-snapshot";

/**
 * Сверка снимков при правке, которая разметку не меняет.
 *
 * Запуск:
 *   bun scripts/snapshot-compare.ts КАТАЛОГ_A КАТАЛОГ_B
 *
 * Три числа: .html, совпавшие вне строки манифеста побайтно; .html, у которых
 * строка манифеста совпала после sortManifestPreloads; .preloads.txt, совпавшие
 * побайтно. Каждое расхождение — отдельной строкой. Файлы, которые есть только
 * на одной стороне, — расхождение состава, не ошибка входа.
 *
 * Код выхода: 0 — все три числа полные и состав совпал; 1 — расхождение;
 * 2 — ошибка входа или вызова (нет аргументов, нет каталога, ни одного .html
 * на какой-либо стороне). Раньше
 * отсутствующий каталог ронял скрипт необработанным исключением с кодом 1 —
 * неотличимо от расхождения.
 */

const MANIFEST = '<script class="$tsr" id="$tsr-stream-barrier">';

export const EXIT_OK = 0;
export const EXIT_DIFF = 1;
export const EXIT_INPUT = 2;
const USAGE = "вызов: bun scripts/snapshot-compare.ts КАТАЛОГ_A КАТАЛОГ_B";

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export type HtmlPair = {
  /** Номер строки манифеста в A и B, от нуля; −1 — строки нет. */
  manifestA: number;
  manifestB: number;
  /** Вне строки манифеста тексты совпали и строка стоит на том же месте. */
  outsideSame: boolean;
  /** Строка манифеста совпала после сортировки preloads. */
  manifestSorted: boolean;
  /** Строка манифеста совпала побайтно (считается только при manifestSorted). */
  manifestExact: boolean;
};

export function comparePair(aText: string, bText: string): HtmlPair {
  const a = aText.split("\n");
  const b = bText.split("\n");
  const ma = a.findIndex((l) => l.startsWith(MANIFEST));
  const mb = b.findIndex((l) => l.startsWith(MANIFEST));
  const restA = a.filter((_, i) => i !== ma).join("\n");
  const restB = b.filter((_, i) => i !== mb).join("\n");
  const manifestSorted =
    ma >= 0 && mb >= 0 && sortManifestPreloads(a[ma]) === sortManifestPreloads(b[mb]);
  return {
    manifestA: ma,
    manifestB: mb,
    outsideSame: ma === mb && restA === restB,
    manifestSorted,
    manifestExact: manifestSorted && a[ma] === b[mb],
  };
}

/** Чтение файла снимка: сторона и имя → байты. */
export type ReadFile = (side: "a" | "b", name: string) => Buffer;

export type Report = { messages: string[]; summary: string; ok: boolean };

export function compareDirs(namesA: string[], namesB: string[], read: ReadFile): Report {
  const messages: string[] = [];
  const sameNames = namesA.join("\n") === namesB.join("\n");
  if (!sameNames) {
    messages.push(`состав каталогов различается: ${namesA.length} против ${namesB.length}`);
    const setA = new Set(namesA);
    const setB = new Set(namesB);
    for (const n of namesA) if (!setB.has(n)) messages.push(`${n}: только в A`);
    for (const n of namesB) if (!setA.has(n)) messages.push(`${n}: только в B`);
  }
  // Сравниваются только пары, присутствующие с обеих сторон: чтение файла,
  // которого нет на одной стороне, было бы исключением, а не вердиктом.
  const both = new Set(namesB);
  const html = namesA.filter((n) => n.endsWith(".html") && both.has(n));
  const pre = namesA.filter((n) => n.endsWith(".preloads.txt") && both.has(n));
  let outside = 0;
  let manifest = 0;
  let manifestBytes = 0;
  for (const n of html) {
    const p = comparePair(read("a", n).toString("utf8"), read("b", n).toString("utf8"));
    if (p.outsideSame) outside++;
    else
      messages.push(
        `${n}: вне манифеста различается (строка манифеста A:${p.manifestA + 1} B:${p.manifestB + 1})`,
      );
    if (p.manifestSorted) {
      manifest++;
      if (p.manifestExact) manifestBytes++;
    } else messages.push(`${n}: манифест различается и после сортировки preloads`);
  }
  let preSame = 0;
  for (const n of pre) {
    if (read("a", n).equals(read("b", n))) preSame++;
    else messages.push(`${n}: .preloads.txt различается`);
  }
  return {
    messages,
    summary:
      `вне строки манифеста побайтно: ${outside}/${html.length}; манифест после сортировки: ${manifest}/${html.length} ` +
      `(из них побайтно ${manifestBytes}); .preloads.txt побайтно: ${preSame}/${pre.length}`,
    ok: sameNames && outside === html.length && manifest === html.length && preSame === pre.length,
  };
}

/** Точка входа: возвращает код процесса (EXIT_OK / EXIT_DIFF / EXIT_INPUT). */
export function main(argv: string[], out: (line: string) => void, err: (line: string) => void) {
  const [dirA, dirB] = argv;
  if (argv.length !== 2 || !dirA || !dirB) {
    err(USAGE);
    return EXIT_INPUT;
  }
  for (const d of [dirA, dirB])
    if (!isDir(d)) {
      err(`нет каталога ${d}`);
      return EXIT_INPUT;
    }
  const namesA = fs.readdirSync(dirA).sort();
  const namesB = fs.readdirSync(dirB).sort();
  // Ноль страниц с любой стороны — сравнивать нечего: «0/0» с кодом 0 было бы
  // совпадением ни о чём (в #83 так «прошла» сверка на пустых каталогах).
  for (const [d, names] of [
    [dirA, namesA],
    [dirB, namesB],
  ] as const)
    if (!names.some((n) => n.endsWith(".html"))) {
      err(`нет ни одного .html в ${d}`);
      return EXIT_INPUT;
    }
  const read: ReadFile = (side, name) =>
    fs.readFileSync(path.join(side === "a" ? dirA : dirB, name));
  const report = compareDirs(namesA, namesB, read);
  for (const m of report.messages) out(m);
  out(report.summary);
  return report.ok ? EXIT_OK : EXIT_DIFF;
}

if (import.meta.main) process.exit(main(process.argv.slice(2), console.log, console.error));
