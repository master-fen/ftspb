import { describe, expect, test } from "bun:test";

import { formatPhotoHash, parsePhotoHash } from "@/lib/photo-hash";

// Значение hash — как отдаёт роутер: без `#`. total = 8, если не сказано иное.
const TOTAL = 8;

describe("parsePhotoHash", () => {
  test("1) пустой hash → null", () => {
    expect(parsePhotoHash("", TOTAL)).toBeNull();
  });

  test("2) photo=1 → 0", () => {
    expect(parsePhotoHash("photo=1", TOTAL)).toBe(0);
  });

  test("3) photo=8 при total 8 → 7", () => {
    expect(parsePhotoHash("photo=8", TOTAL)).toBe(7);
  });

  test("4) photo=9 при total 8 → null", () => {
    expect(parsePhotoHash("photo=9", TOTAL)).toBeNull();
  });

  test("5) photo=0 → null", () => {
    expect(parsePhotoHash("photo=0", TOTAL)).toBeNull();
  });

  test("6) photo=-1 → null", () => {
    expect(parsePhotoHash("photo=-1", TOTAL)).toBeNull();
  });

  test("7) photo=01 (ведущий ноль) → null", () => {
    expect(parsePhotoHash("photo=01", TOTAL)).toBeNull();
  });

  test("8) photo=1.5 → null", () => {
    expect(parsePhotoHash("photo=1.5", TOTAL)).toBeNull();
  });

  test("9) photo=abc → null", () => {
    expect(parsePhotoHash("photo=abc", TOTAL)).toBeNull();
  });

  test("10) photo= → null", () => {
    expect(parsePhotoHash("photo=", TOTAL)).toBeNull();
  });

  test("11) чужой hash razdel-3 → null", () => {
    expect(parsePhotoHash("razdel-3", TOTAL)).toBeNull();
  });

  test("12) PHOTO=1 (регистр) → null", () => {
    expect(parsePhotoHash("PHOTO=1", TOTAL)).toBeNull();
  });

  test("13) photo=1&x=2 (хвост) → null", () => {
    expect(parsePhotoHash("photo=1&x=2", TOTAL)).toBeNull();
  });

  test("14) « photo=1» (пробел впереди) → null", () => {
    expect(parsePhotoHash(" photo=1", TOTAL)).toBeNull();
  });

  test("15) photo=1 при total 0 → null", () => {
    expect(parsePhotoHash("photo=1", 0)).toBeNull();
  });

  test("16) photo=99999999999999999999 → null", () => {
    expect(parsePhotoHash("photo=99999999999999999999", TOTAL)).toBeNull();
  });

  test("17) round-trip: parsePhotoHash(formatPhotoHash(i)) === i для i в [0, 8); formatPhotoHash(0) === photo=1", () => {
    expect(formatPhotoHash(0)).toBe("photo=1");
    for (let i = 0; i < TOTAL; i++) {
      expect(parsePhotoHash(formatPhotoHash(i), TOTAL)).toBe(i);
    }
  });
});
