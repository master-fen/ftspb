import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  loadPlaces,
  locateDirs,
  parsePlaces,
  type Places,
  type ReadPage,
  SpecError,
} from "./snapshot-locate";

// Встроенной самопроверки у прежней версии (check.ts, md5 e792c22c) не было;
// случаи синтетические, по форме нормализованного снимка. Правило счёта здесь
// прежнее: строка снимка засчитывается метке, если содержит её строку
// подстрокой. Значения спецификации — в обёртке class="…", как константы
// check.ts:9-16.

const NEEDLE = 'class="badge old"';
const PLACES: Places = { "бейдж(старый)": [NEEDLE] };

const read =
  (pages: Record<string, string[]>): ReadPage =>
  (name) =>
    pages[name].join("\n");

const run = (pages: Record<string, string[]>, places: Places = PLACES) =>
  locateDirs(Object.keys(pages).sort(), read(pages), places);

const HIT = `<div ${NEEDLE}>`;

describe("locateDirs — правило подстроки", () => {
  test("1) маркеры на месте, вхождение внутри области", () => {
    const r = run({ "p.html": ["<html>", "<main>", HIT, "</main>", "</html>"] });
    expect(r.noStart).toBe(0);
    expect(r.noEnd).toBe(0);
    expect(r.badOrder).toBe(0);
    expect(r.lines).toContain("  p: бейдж(старый)=1; все вхождения в области: true");
    expect(r.lines).toContain(
      "страниц: 1; без начала «<main»: 0; без конца «</main>»: 0; неверный порядок: 0",
    );
    expect(r.exitCode).toBe(0);
  });

  test("2) нет начала области", () => {
    const r = run({ "p.html": ["<html>", HIT, "</main>", "</html>"] });
    expect(r.lines).toContain("  нет начала: p.html");
    expect(r.noStart).toBe(1);
    expect(r.exitCode).toBe(0);
  });

  test("3) нет конца области", () => {
    const r = run({ "p.html": ["<html>", "<main>", HIT, "</html>"] });
    expect(r.lines).toContain("  нет конца: p.html");
    expect(r.noEnd).toBe(1);
    expect(r.exitCode).toBe(0);
  });

  test("4) конец перед началом, второго конца нет — «нет конца», не «порядок»", () => {
    const r = run({ "p.html": ["<html>", "</main>", "<main>", HIT, "</html>"] });
    expect(r.lines).toContain("  нет конца: p.html");
    expect(r.noEnd).toBe(1);
    // Ветка «порядок» недостижима: конец ищется только после начала.
    expect(r.badOrder).toBe(0);
    expect(r.lines.some((l) => l.startsWith("  порядок:"))).toBe(false);
    expect(r.exitCode).toBe(0);
  });

  test("5) вхождение после </main> — вне области", () => {
    const r = run({ "p.html": ["<html>", "<main>", "<p>x</p>", "</main>", HIT, "</html>"] });
    expect(r.lines).toContain("  p: бейдж(старый)=1; все вхождения в области: false");
  });

  test("6) два вхождения в одной строке снимка засчитываются за одно", () => {
    const r = run({ "p.html": ["<html>", "<main>", `${HIT}${HIT}`, "</main>", "</html>"] });
    expect(r.totals).toEqual([1]);
  });

  test("7) у метки две строки, каждая по разу на своей строке — 2", () => {
    const second = 'class="badge new"';
    const r = run(
      {
        "p.html": ["<html>", "<main>", HIT, `<div ${second}>`, "</main>", "</html>"],
      },
      { бейдж: [NEEDLE, second] },
    );
    expect(r.totals).toEqual([2]);
  });

  test("8) страница без вхождений в вывод не попадает, числа сходятся", () => {
    const r = run({
      "p.html": ["<html>", "<main>", HIT, "</main>", "</html>"],
      "q.html": ["<html>", "<main>", "<p>x</p>", "</main>", "</html>"],
    });
    expect(r.lines.some((l) => l.startsWith("  q:"))).toBe(false);
    expect(r.pagesWithHits).toBe(1);
    expect(r.totals).toEqual([1]);
    expect(r.lines).toContain("страниц с вхождениями: 1; всего: бейдж(старый) 1");
  });
});

describe("спецификация — отказы", () => {
  test("9) файла нет — отказ", () => {
    const missing = path.join(os.tmpdir(), "snapshot-locate-нет-такого-файла.json");
    expect(() => loadPlaces(missing)).toThrow(SpecError);
  });

  test("10) пустой объект и пустое «места» — отказ", () => {
    expect(() => parsePlaces("{}")).toThrow(SpecError);
    expect(() => parsePlaces('{"места":{}}')).toThrow(SpecError);
  });

  test("11) неизвестный ключ верхнего уровня — отказ", () => {
    expect(() => parsePlaces('{"места":{"м":["x"]},"лишнее":1}')).toThrow(SpecError);
  });

  test("12) значение метки — не непустой массив непустых строк", () => {
    expect(() => parsePlaces('{"места":{"м":"x"}}')).toThrow(SpecError);
    expect(() => parsePlaces('{"места":{"м":[]}}')).toThrow(SpecError);
    expect(() => parsePlaces('{"места":{"м":[""]}}')).toThrow(SpecError);
    expect(() => parsePlaces('{"места":{"м":[1]}}')).toThrow(SpecError);
  });
});
