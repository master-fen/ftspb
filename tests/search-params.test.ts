import { describe, expect, test } from "bun:test";
import {
  parseSearchQParam,
  parseSearchSortParam,
  parseSearchTabParam,
  parseSearchYearParam,
} from "@/lib/search-params";

describe("parseSearchQParam", () => {
  test("не строка — пустая строка", () => {
    expect(parseSearchQParam(undefined)).toBe("");
    expect(parseSearchQParam(42)).toBe("");
  });

  test("длиннее 100 знаков — обрезается", () => {
    expect(parseSearchQParam("а".repeat(500)).length).toBe(100);
  });

  test("обычная строка проходит как есть", () => {
    expect(parseSearchQParam("турнир")).toBe("турнир");
  });
});

describe("parseSearchTabParam", () => {
  test("мусор → all", () => {
    expect(parseSearchTabParam("что-то")).toBe("all");
    expect(parseSearchTabParam(undefined)).toBe("all");
  });

  test("известные значения проходят как есть", () => {
    expect(parseSearchTabParam("news")).toBe("news");
    expect(parseSearchTabParam("documents")).toBe("documents");
    expect(parseSearchTabParam("events")).toBe("events");
    expect(parseSearchTabParam("sections")).toBe("sections");
  });
});

describe("parseSearchSortParam", () => {
  test("мусор → relevance", () => {
    expect(parseSearchSortParam("что-то")).toBe("relevance");
  });

  test("date проходит как есть", () => {
    expect(parseSearchSortParam("date")).toBe("date");
  });
});

describe("parseSearchYearParam", () => {
  test("мусор → all", () => {
    expect(parseSearchYearParam("abc")).toBe("all");
    expect(parseSearchYearParam(undefined)).toBe("all");
  });

  test("год вне диапазона → all", () => {
    expect(parseSearchYearParam(1800)).toBe("all");
    expect(parseSearchYearParam(3000)).toBe("all");
  });

  test("год в диапазоне проходит как число", () => {
    expect(parseSearchYearParam(2019)).toBe(2019);
    expect(parseSearchYearParam("2019")).toBe(2019);
  });
});
