import { describe, expect, test } from "bun:test";

import { galleryImages, galleryLayout } from "@/lib/gallery-layout";

// Числа колонок — те же, что в классах сетки NewsGallery:
// grid-cols-3 ниже sm, sm:grid-cols-4 от sm.
const NARROW = 3;
const WIDE = 4;

type Expected = { thumbs: number; hiddenCount: number; overlayIndex: number | null };

function layout(total: number, columns: number, expected: Expected) {
  expect(galleryLayout(total, columns)).toEqual(expected);
}

describe("galleryLayout", () => {
  test("columns 4, total 0 → thumbs 0, hidden 0, overlay null", () => {
    layout(0, WIDE, { thumbs: 0, hiddenCount: 0, overlayIndex: null });
  });

  test("columns 4, total 1 → thumbs 0, hidden 0, overlay null", () => {
    layout(1, WIDE, { thumbs: 0, hiddenCount: 0, overlayIndex: null });
  });

  test("columns 4, total 2 → thumbs 1, hidden 0, overlay null", () => {
    layout(2, WIDE, { thumbs: 1, hiddenCount: 0, overlayIndex: null });
  });

  test("columns 4, total 5 → thumbs 4, hidden 0, overlay null", () => {
    layout(5, WIDE, { thumbs: 4, hiddenCount: 0, overlayIndex: null });
  });

  test("columns 4, total 6 → thumbs 4, hidden 1, overlay 4", () => {
    layout(6, WIDE, { thumbs: 4, hiddenCount: 1, overlayIndex: 4 });
  });

  test("columns 4, total 11 → thumbs 4, hidden 6, overlay 4", () => {
    layout(11, WIDE, { thumbs: 4, hiddenCount: 6, overlayIndex: 4 });
  });

  test("columns 4, total 24 → thumbs 4, hidden 19, overlay 4", () => {
    layout(24, WIDE, { thumbs: 4, hiddenCount: 19, overlayIndex: 4 });
  });

  test("columns 3, total 4 → thumbs 3, hidden 0, overlay null", () => {
    layout(4, NARROW, { thumbs: 3, hiddenCount: 0, overlayIndex: null });
  });

  test("columns 3, total 5 → thumbs 3, hidden 1, overlay 3", () => {
    layout(5, NARROW, { thumbs: 3, hiddenCount: 1, overlayIndex: 3 });
  });

  test("columns 3, total 11 → thumbs 3, hidden 7, overlay 3", () => {
    layout(11, NARROW, { thumbs: 3, hiddenCount: 7, overlayIndex: 3 });
  });
});

describe("galleryImages", () => {
  test("с обложкой: обложка первой, затем галерея", () => {
    expect(galleryImages("/c.jpg", ["/1.jpg", "/2.jpg"])).toEqual(["/c.jpg", "/1.jpg", "/2.jpg"]);
  });

  test("без обложки: галерея как есть", () => {
    const list = ["/1.jpg", "/2.jpg"];
    expect(galleryImages(undefined, list)).toEqual(["/1.jpg", "/2.jpg"]);
  });
});
