import { describe, expect, test } from "bun:test";
import { splitParagraphs, toMetaDescription } from "@/lib/plain-text";

describe("splitParagraphs", () => {
  test("абзацы по пустой строке, одиночный перевод строки остаётся внутри", () => {
    expect(splitParagraphs("Повестка:\n1. Отчёт\n2. Бюджет\n\nНачало в 18:00")).toEqual([
      "Повестка:\n1. Отчёт\n2. Бюджет",
      "Начало в 18:00",
    ]);
  });

  test("CRLF, строка из пробелов и несколько пустых строк подряд", () => {
    expect(splitParagraphs("А\r\n  \r\nБ\n\n\n\nВ")).toEqual(["А", "Б", "В"]);
  });

  test("пустой текст и одни пробелы — нет абзацев", () => {
    expect(splitParagraphs("")).toEqual([]);
    expect(splitParagraphs(" \n\n \n")).toEqual([]);
  });
});

describe("toMetaDescription", () => {
  test("короткий текст — только схлопывание пробелов", () => {
    expect(toMetaDescription("  Заседание\n\nПравления  ")).toBe("Заседание Правления");
  });

  test("длинный — обрезка по границе слова, с многоточием, не длиннее лимита", () => {
    const result = toMetaDescription("один два три четыре пять", 14);
    expect(result).toBe("один два три…");
    expect(result.length).toBeLessThanOrEqual(14);
  });

  test("знаки препинания перед многоточием срезаются", () => {
    expect(toMetaDescription("один, два, три, четыре", 12)).toBe("один, два…");
  });

  test("ровно на лимите — без изменений", () => {
    expect(toMetaDescription("абвгд", 5)).toBe("абвгд");
  });

  test("одно слово длиннее лимита — режется посередине", () => {
    expect(toMetaDescription("абвгдежзик", 5)).toBe("абвг…");
  });
});
