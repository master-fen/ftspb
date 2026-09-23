import { describe, expect, test } from "bun:test";
import { MAX_PHOTO_DIMENSION, parsePhotoSize } from "@/lib/photo-dimensions";

describe("размеры фото из браузера", () => {
  test("пара строк формы — разбирается", () => {
    expect(parsePhotoSize("800", "600")).toEqual({ width: 800, height: 600 });
  });

  test("пара чисел — разбирается", () => {
    expect(parsePhotoSize(1600, 1200)).toEqual({ width: 1600, height: 1200 });
  });

  test("ровно предел — разбирается", () => {
    expect(parsePhotoSize(MAX_PHOTO_DIMENSION, MAX_PHOTO_DIMENSION)).toEqual({
      width: MAX_PHOTO_DIMENSION,
      height: MAX_PHOTO_DIMENSION,
    });
  });

  test("на единицу больше предела — отказ", () => {
    expect(parsePhotoSize(MAX_PHOTO_DIMENSION + 1, 600)).toBeNull();
    expect(parsePhotoSize(800, MAX_PHOTO_DIMENSION + 1)).toBeNull();
  });

  test("ноль — отказ", () => {
    expect(parsePhotoSize(0, 0)).toBeNull();
    expect(parsePhotoSize("0", "600")).toBeNull();
  });

  test("отрицательное — отказ", () => {
    expect(parsePhotoSize(-1, 600)).toBeNull();
    expect(parsePhotoSize("800", "-600")).toBeNull();
  });

  test("дробное — отказ", () => {
    expect(parsePhotoSize(800.5, 600)).toBeNull();
    expect(parsePhotoSize("800", "600.5")).toBeNull();
  });

  test("не число — отказ", () => {
    expect(parsePhotoSize("восемьсот", "600")).toBeNull();
    expect(parsePhotoSize(NaN, 600)).toBeNull();
    expect(parsePhotoSize(Infinity, 600)).toBeNull();
    expect(parsePhotoSize(true, 600)).toBeNull();
  });

  test("поля не пришли — отказ", () => {
    expect(parsePhotoSize(undefined, undefined)).toBeNull();
    expect(parsePhotoSize(null, null)).toBeNull();
    expect(parsePhotoSize("", "")).toBeNull();
  });

  test("валидна только одна сторона — отказ, обе или ничего", () => {
    expect(parsePhotoSize(800, undefined)).toBeNull();
    expect(parsePhotoSize(undefined, 600)).toBeNull();
    expect(parsePhotoSize("800", "abc")).toBeNull();
  });
});
