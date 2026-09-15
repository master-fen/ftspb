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
 * побайтно. Каждое расхождение — отдельной строкой. Код выхода 0 — все три
 * числа полные.
 */

const MANIFEST = '<script class="$tsr" id="$tsr-stream-barrier">';

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
  if (namesA.join("\n") !== namesB.join("\n"))
    messages.push(`состав каталогов различается: ${namesA.length} против ${namesB.length}`);
  const html = namesA.filter((n) => n.endsWith(".html"));
  const pre = namesA.filter((n) => n.endsWith(".preloads.txt"));
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
    ok: outside === html.length && manifest === html.length && preSame === pre.length,
  };
}

if (import.meta.main) {
  const [dirA, dirB] = process.argv.slice(2);
  const namesA = fs.readdirSync(dirA).sort();
  const namesB = fs.readdirSync(dirB).sort();
  const read: ReadFile = (side, name) =>
    fs.readFileSync(path.join(side === "a" ? dirA : dirB, name));
  const report = compareDirs(namesA, namesB, read);
  for (const m of report.messages) console.log(m);
  console.log(report.summary);
  process.exit(report.ok ? 0 : 1);
}
