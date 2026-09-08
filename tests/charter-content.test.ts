/**
 * Контрольные числа разбора Устава. Числа — спецификация, полученная
 * прототипом на той же выгрузке: если реализация даёт другие, чинится
 * реализация (или честно фиксируется расхождение), но не сами числа.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { charterContent } from "@/lib/charter/content";
import { CHARTER_SECTION_TITLES } from "@/lib/charter/meta";
import { parseCharterLines, type CharterLinesJson } from "@/lib/charter/parse-lines";

const root = path.resolve(import.meta.dir, "..");
const pdfPath = path.join(root, "docs", "charter", "ustav.pdf");
const jsonPath = path.join(root, "docs", "charter", "ustav.lines.json");

const PDF_SHA256 = "c3a901a2529bf0d02477272365a79a8cd08b0aa9da493c8f0f7ba31ab56f37b3";
const JSON_SHA256 = "3564dd98f9d345534287df9d1c0d70b01be77e9ba023d90c27aabf7f4ed652ce";

const EXPECTED_TITLES = [
  "ОБЩИЕ ПОЛОЖЕНИЯ",
  "ЦЕЛИ И ЗАДАЧИ ФЕДЕРАЦИИ",
  "ВИДЫ ДЕЯТЕЛЬНОСТИ ФЕДЕРАЦИИ",
  "ПРАВА И ОБЯЗАННОСТИ ФЕДЕРАЦИИ",
  "ЧЛЕНЫ ФЕДЕРАЦИИ, ИХ ПРАВА И ОБЯЗАННОСТИ",
  "РУКОВОДЯЩИЕ И РЕВИЗИОННЫЕ ОРГАНЫ ФЕДЕРАЦИИ",
  "ИМУЩЕСТВО И СРЕДСТВА ФЕДЕРАЦИИ",
  "ПРЕДПРИНИМАТЕЛЬСКАЯ ДЕЯТЕЛЬНОСТЬ ФЕДЕРАЦИИ",
  "СИМВОЛИКА ФЕДЕРАЦИИ",
  "ВНЕСЕНИЕ ИЗМЕНЕНИЙ В УСТАВ",
  "ЛИКВИДАЦИЯ И РЕОРГАНИЗАЦИЯ ФЕДЕРАЦИИ",
];

const EXPECTED_PARAGRAPHS = [18, 2, 1, 2, 12, 27, 6, 7, 5, 1, 3];
const EXPECTED_CLAUSES = [10, 2, 1, 2, 12, 19, 6, 6, 1, 1, 3];
const EXPECTED_LISTS = [0, 1, 1, 2, 4, 6, 1, 1, 2, 0, 0];
const EXPECTED_ITEMS = [0, 5, 8, 34, 23, 49, 5, 8, 3, 0, 0];

const SENTENCE_END = [".", ";", ":", "!", "?", "»", ")"];

const json = JSON.parse(readFileSync(jsonPath, "utf8")) as CharterLinesJson;
const parsed = parseCharterLines(json);

function isPageNumberLine(line: { text: string; x0: number }): boolean {
  return line.x0 > 540 && /^\d{1,2}$/.test(line.text.trim());
}

/** Тексты блоков раздела по порядку: абзацы и элементы списков. */
function blockTexts(section: (typeof charterContent.sections)[number]): string[] {
  return section.blocks.flatMap((block) =>
    block.kind === "paragraph" ? [block.text] : block.items,
  );
}

const allBlockTexts = charterContent.sections.flatMap(blockTexts);

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + 1);
  }
  return count;
}

function totalOccurrences(needle: string): number {
  return allBlockTexts.reduce((sum, text) => sum + countOccurrences(text, needle), 0);
}

describe("входные файлы", () => {
  test("SHA256 файла ustav.pdf", () => {
    const hash = createHash("sha256").update(readFileSync(pdfPath)).digest("hex");
    expect(hash).toBe(PDF_SHA256);
  });

  test("SHA256 файла ustav.lines.json после нормализации CRLF → LF", () => {
    const text = readFileSync(jsonPath, "utf8").replaceAll("\r\n", "\n");
    const hash = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
    expect(hash).toBe(JSON_SHA256);
  });

  test("source.sha256 в JSON равен хэшу PDF", () => {
    expect(json.source.sha256).toBe(PDF_SHA256);
  });

  test("17 страниц, 593 строки, 16 строк-номеров страниц", () => {
    expect(json.pages.length).toBe(17);
    const lines = json.pages.flatMap((page) => page.lines);
    expect(lines.length).toBe(593);
    expect(lines.filter(isPageNumberLine).length).toBe(16);
  });
});

describe("структура", () => {
  test("content.ts актуален: parseCharterLines(json) глубоко равен charterContent", () => {
    expect(parsed).toEqual(charterContent);
  });

  test("преамбула: 5 групп по [3, 5, 1, 4, 2] строк", () => {
    expect(charterContent.preamble.map((group) => group.length)).toEqual([3, 5, 1, 4, 2]);
  });

  test("11 разделов с номерами 1…11 и точными заголовками", () => {
    expect(charterContent.sections.map((section) => section.number)).toEqual(
      EXPECTED_TITLES.map((_, index) => index + 1),
    );
    expect(charterContent.sections.map((section) => section.title)).toEqual(EXPECTED_TITLES);
  });

  test("по разделам: абзацы, пункты, списки, элементы", () => {
    const paragraphs = charterContent.sections.map(
      (section) => section.blocks.filter((block) => block.kind === "paragraph").length,
    );
    const clauses = charterContent.sections.map(
      (section) =>
        section.blocks.filter((block) => block.kind === "paragraph" && block.clause !== undefined)
          .length,
    );
    const lists = charterContent.sections.map(
      (section) => section.blocks.filter((block) => block.kind === "list").length,
    );
    const items = charterContent.sections.map((section) =>
      section.blocks.reduce(
        (sum, block) => sum + (block.kind === "list" ? block.items.length : 0),
        0,
      ),
    );
    expect(paragraphs).toEqual(EXPECTED_PARAGRAPHS);
    expect(clauses).toEqual(EXPECTED_CLAUSES);
    expect(lists).toEqual(EXPECTED_LISTS);
    expect(items).toEqual(EXPECTED_ITEMS);
  });

  test("итого: 102 блока, 84 абзаца, 63 пункта, 18 списков, 135 элементов", () => {
    const blocks = charterContent.sections.flatMap((section) => section.blocks);
    const paragraphs = blocks.filter((block) => block.kind === "paragraph");
    const lists = blocks.filter((block) => block.kind === "list");
    expect(blocks.length).toBe(102);
    expect(paragraphs.length).toBe(84);
    expect(paragraphs.filter((block) => block.clause !== undefined).length).toBe(63);
    expect(lists.length).toBe(18);
    expect(lists.reduce((sum, block) => sum + block.items.length, 0)).toBe(135);
  });

  test("в каждом разделе N пункты идут подряд N.1 … N.K; 63 значения clause уникальны", () => {
    const all: string[] = [];
    for (const section of charterContent.sections) {
      const clauses = section.blocks.flatMap((block) =>
        block.kind === "paragraph" && block.clause !== undefined ? [block.clause] : [],
      );
      expect(clauses).toEqual(clauses.map((_, index) => `${section.number}.${index + 1}`));
      all.push(...clauses);
    }
    expect(new Set(all).size).toBe(63);
  });
});

describe("текст", () => {
  test("нет маркеров и слипшихся переносов", () => {
    for (const needle of [
      "\uF0A7",
      "\uF0B7",
      "СанктПетербург",
      "вицепрезидент",
      "Контрольноревизион",
    ]) {
      expect(totalOccurrences(needle)).toBe(0);
    }
  });

  test("контрольные вхождения", () => {
    expect(totalOccurrences("Санкт-Петербург")).toBe(28);
    expect(totalOccurrences("вице-президент")).toBe(8);
    expect(totalOccurrences("Контрольно-ревизион")).toBe(15);
    expect(totalOccurrences("Контрольно- ревизион")).toBe(1);
    expect(totalOccurrences("∂")).toBe(1);
  });

  test("каждый текст блока оканчивается завершающим знаком", () => {
    for (const text of allBlockTexts) {
      expect(SENTENCE_END).toContain(text.slice(-1));
    }
  });

  test("тексты начинаются с прописной буквы или цифры — кроме 8 элементов списка раздела 8", () => {
    const violations: { section: number; kind: string; text: string }[] = [];
    for (const section of charterContent.sections) {
      for (const block of section.blocks) {
        const texts = block.kind === "paragraph" ? [block.text] : block.items;
        for (const text of texts) {
          if (!/^[0-9A-ZА-ЯЁ]/.test(text)) {
            violations.push({ section: section.number, kind: block.kind, text });
          }
        }
      }
    }
    expect(violations.length).toBe(8);
    for (const violation of violations) {
      expect(violation.section).toBe(8);
      expect(violation.kind).toBe("list");
    }
  });

  test("заголовки разделов согласованы с CHARTER_SECTION_TITLES", () => {
    for (const section of charterContent.sections) {
      expect(CHARTER_SECTION_TITLES[section.number].toUpperCase()).toBe(section.title);
    }
  });

  test("сохранение символов: контент без пробелов равен выгрузке без пробелов и маркеров", () => {
    const fromContent = [
      ...charterContent.preamble.flat(),
      ...charterContent.sections.flatMap((section) => [
        `${section.number}. ${section.title}`,
        ...blockTexts(section),
      ]),
    ]
      .join("")
      .replace(/\s+/g, "");
    const fromLines = json.pages
      .flatMap((page) => page.lines)
      .filter((line) => !isPageNumberLine(line))
      .map((line) => line.text)
      .join("")
      .replace(/[\uF0A7\uF0B7]/g, "")
      .replace(/\s+/g, "");
    expect(fromContent).toBe(fromLines);
  });
});
