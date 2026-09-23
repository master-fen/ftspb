import { describe, expect, test } from "bun:test";
import { CARD_COVER_SLOT, CARD_COVER_UPSCALE_TOLERANCE, isSmallCover } from "@/lib/card-cover";

describe("маленькая обложка карточки", () => {
  test("порог — область 413×310 и допуск 1.15", () => {
    expect(CARD_COVER_SLOT).toEqual({ width: 413, height: 310 });
    expect(CARD_COVER_UPSCALE_TOLERANCE).toBe(1.15);
  });

  test("300×225 — увеличение в 1,38 по обеим сторонам: маленькая", () => {
    expect(isSmallCover(300, 225)).toBe(true);
  });

  test("358×310 — по ширине надо больше 15 %: маленькая", () => {
    expect(isSmallCover(358, 310)).toBe(true);
  });

  test("359×310 — граница по ширине снизу (359·1,15 = 412,85 < 413): маленькая", () => {
    expect(isSmallCover(359, 310)).toBe(true);
  });

  test("360×270 — граница по ширине сверху (360·1,15 = 414 ≥ 413): обычная", () => {
    expect(isSmallCover(360, 270)).toBe(false);
  });

  test("413×269 — граница по высоте снизу (269·1,15 = 309,35 < 310): маленькая", () => {
    expect(isSmallCover(413, 269)).toBe(true);
  });

  test("413×270 — граница по высоте сверху (270·1,15 = 310,5 ≥ 310): обычная", () => {
    expect(isSmallCover(413, 270)).toBe(false);
  });

  test("400×300 — недобор 3 %, ради чего заведён допуск: обычная", () => {
    expect(isSmallCover(400, 300)).toBe(false);
  });

  test("413×310 — ровно область: обычная", () => {
    expect(isSmallCover(413, 310)).toBe(false);
  });

  test("1600×200 — широкая и низкая, недобор только по высоте: маленькая", () => {
    expect(isSmallCover(1600, 200)).toBe(true);
  });

  test("300×1200 — узкая и высокая, недобор только по ширине: маленькая", () => {
    expect(isSmallCover(300, 1200)).toBe(true);
  });

  test("размеров нет (undefined, null, одна сторона): обычная", () => {
    expect(isSmallCover(undefined, undefined)).toBe(false);
    expect(isSmallCover(null, null)).toBe(false);
    expect(isSmallCover(300, undefined)).toBe(false);
    expect(isSmallCover(undefined, 225)).toBe(false);
  });

  test("мусор вместо размера (0, −1, дробное, NaN, Infinity): обычная", () => {
    expect(isSmallCover(0, 0)).toBe(false);
    expect(isSmallCover(-1, -1)).toBe(false);
    expect(isSmallCover(300.5, 225)).toBe(false);
    expect(isSmallCover(NaN, NaN)).toBe(false);
    expect(isSmallCover(Infinity, Infinity)).toBe(false);
  });
});
