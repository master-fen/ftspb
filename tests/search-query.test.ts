import { describe, expect, test } from "bun:test";
import { parseSearchQuery } from "@/lib/search-query";

describe("parseSearchQuery — «уточните запрос»", () => {
  test("одни служебные слова — все термины отфильтрованы", () => {
    expect(parseSearchQuery("в на по").tooVague).toBe(true);
  });

  test("одна буква — короче 2 знаков, отфильтрована", () => {
    expect(parseSearchQuery("а").tooVague).toBe(true);
  });

  test("бессмысленный, но значимый по длине запрос — не «уточните»", () => {
    expect(parseSearchQuery("ывапролд").tooVague).toBe(false);
  });

  test("пустой запрос — «уточните»", () => {
    expect(parseSearchQuery("").tooVague).toBe(true);
    expect(parseSearchQuery(undefined).tooVague).toBe(true);
  });

  test("смесь служебного и значимого слова — значимое остаётся", () => {
    const parsed = parseSearchQuery("и турнир");
    expect(parsed.tooVague).toBe(false);
    expect(parsed.terms).toHaveLength(1);
  });
});

describe("parseSearchQuery — обрезка длины", () => {
  test("запрос длиннее 100 знаков обрезается", () => {
    const long = "а".repeat(500);
    expect(parseSearchQuery(long).raw.length).toBe(100);
  });
});

describe("parseSearchQuery — составной термин", () => {
  test("дефисное слово — один термин с whole и двумя частями", () => {
    const parsed = parseSearchQuery("Санкт-Петербург");
    expect(parsed.terms).toHaveLength(1);
    expect(parsed.terms[0].parts).toHaveLength(2);
    expect(parsed.terms[0].whole.folded).toBe("санктпетербург");
  });

  test("два обычных слова — два термина", () => {
    const parsed = parseSearchQuery("городской турнир");
    expect(parsed.terms).toHaveLength(2);
  });
});
