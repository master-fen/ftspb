import { describe, expect, test } from "bun:test";
import { shouldReturnToNewsList } from "@/lib/news-return";

const PLAIN = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

describe("shouldReturnToNewsList", () => {
  test("маркер, есть куда идти назад, обычный клик — назад по истории", () => {
    expect(shouldReturnToNewsList({ fromNewsList: true }, true, PLAIN)).toBe(true);
  });

  test("без маркера — обычная ссылка", () => {
    expect(shouldReturnToNewsList({}, true, PLAIN)).toBe(false);
  });

  test("назад идти некуда — обычная ссылка", () => {
    expect(shouldReturnToNewsList({ fromNewsList: true }, false, PLAIN)).toBe(false);
  });

  test.each([
    ["ctrl", { ctrlKey: true }],
    ["meta", { metaKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["средняя кнопка", { button: 1 }],
  ])("%s — браузер сам открывает ссылку", (_name, patch) => {
    expect(shouldReturnToNewsList({ fromNewsList: true }, true, { ...PLAIN, ...patch })).toBe(
      false,
    );
  });
});
