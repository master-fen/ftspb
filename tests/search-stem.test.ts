import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { stemWord } from "@/lib/search-stem";

/**
 * Самотест зовёт `stemWord` — единственную точку нормализация+основа, не
 * `snowball-stemmers` напрямую (docs/decisions.md). Фикстуры — выборка из
 * официального эталонного словаря Snowball для русского
 * (snowballstem/snowball-data, russian/voc.txt+output.txt): каждая 10-я пара
 * из 49785 (4979 пар) плюс отдельно все 112 пар со словом на «ё» из полного
 * словаря — на нём стеммер пакета расходится с эталоном без свёртки ё→е.
 */
function loadPairs(fileName: string): Array<[string, string]> {
  const raw = readFileSync(join(import.meta.dir, "fixtures", fileName), "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [word, stem] = line.split("\t");
      return [word, stem] as [string, string];
    });
}

describe("stemWord — выборка эталонного словаря Snowball (4979 пар)", () => {
  const pairs = loadPairs("snowball-ru-sample.tsv");

  test("выборка загрузилась", () => {
    expect(pairs.length).toBe(4979);
  });

  test("100% совпадение с эталоном", () => {
    const mismatches = pairs.filter(([word, expected]) => stemWord(word) !== expected);
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches.length).toBe(0);
  });
});

describe("stemWord — все пары со словом на «ё» (112 пар)", () => {
  const pairs = loadPairs("snowball-ru-yo.tsv");

  test("выборка загрузилась", () => {
    expect(pairs.length).toBe(112);
  });

  test("100% совпадение с эталоном при своей ё→е внутри stemWord", () => {
    const mismatches = pairs.filter(([word, expected]) => stemWord(word) !== expected);
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches.length).toBe(0);
  });
});

describe("stemWord — не кириллица и особые случаи", () => {
  test("латиница возвращается без изменений (кроме регистра)", () => {
    expect(stemWord("ITF")).toBe("itf");
    expect(stemWord("U16")).toBe("u16");
  });

  test("цифры возвращаются без изменений", () => {
    expect(stemWord("2019")).toBe("2019");
  });

  test("ё и е дают одну основу", () => {
    expect(stemWord("актёр")).toBe(stemWord("актер"));
    expect(stemWord("бёдра")).toBe(stemWord("бедра"));
  });

  test("регистр не важен", () => {
    expect(stemWord("ТУРНИР")).toBe(stemWord("турнир"));
  });
});
