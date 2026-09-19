import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { pageSearchField } from "@/lib/news-page-search";
import { NEWS_PAGE_SIZE, clampPage, pageCountFor, paginationState } from "@/lib/news-paging";

const schema = z.object({ page: pageSearchField });

describe("pageSearchField — разбор ?page=", () => {
  test("отсутствует → 1", () => {
    expect(schema.parse({})).toEqual({ page: 1 });
  });

  test("«0» → 1 (числом, как отдаёт парсер адреса, и строкой)", () => {
    expect(schema.parse({ page: 0 })).toEqual({ page: 1 });
    expect(schema.parse({ page: "0" })).toEqual({ page: 1 });
  });

  test("«-3» → 1", () => {
    expect(schema.parse({ page: -3 })).toEqual({ page: 1 });
    expect(schema.parse({ page: "-3" })).toEqual({ page: 1 });
  });

  test("«abc» → 1", () => {
    expect(schema.parse({ page: "abc" })).toEqual({ page: 1 });
  });

  test("дробное 1.5 → 1, целое 2 → 2", () => {
    expect(schema.parse({ page: 1.5 })).toEqual({ page: 1 });
    expect(schema.parse({ page: 2 })).toEqual({ page: 2 });
  });
});

describe("pageCountFor", () => {
  test("24 карточки на страницу: 42 → 2, 24 → 1, 25 → 2, 0 → 0", () => {
    expect(NEWS_PAGE_SIZE).toBe(24);
    expect(pageCountFor(42)).toBe(2);
    expect(pageCountFor(24)).toBe(1);
    expect(pageCountFor(25)).toBe(2);
    expect(pageCountFor(0)).toBe(0);
  });
});

describe("clampPage", () => {
  test("больше числа страниц → 1", () => {
    expect(clampPage(99, 2)).toBe(1);
    expect(clampPage(3, 2)).toBe(1);
  });

  test("в диапазоне — без изменений", () => {
    expect(clampPage(1, 2)).toBe(1);
    expect(clampPage(2, 2)).toBe(2);
  });

  test("ноль страниц и номер ниже единицы → 1", () => {
    expect(clampPage(1, 0)).toBe(1);
    expect(clampPage(0, 2)).toBe(1);
  });
});

describe("paginationState", () => {
  test("первая из двух: «Назад» нет, «Вперёд» на 2", () => {
    expect(paginationState(1, 2)).toEqual({ prev: null, next: 2, label: "Стр. 1 из 2" });
  });

  test("последняя из двух: «Назад» на 1, «Вперёд» нет", () => {
    expect(paginationState(2, 2)).toEqual({ prev: 1, next: null, label: "Стр. 2 из 2" });
  });

  test("середина: обе стороны активны", () => {
    expect(paginationState(2, 3)).toEqual({ prev: 1, next: 3, label: "Стр. 2 из 3" });
  });
});
