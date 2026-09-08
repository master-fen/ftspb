import { describe, expect, test } from "bun:test";
import { coverCrop, COVER_RATIO } from "@/lib/cover-crop";

const PERSON_RATIO = 3 / 4;

describe("cover cropping", () => {
  test("pan and zoom never expose empty pixels, including portrait and tiny images", () => {
    for (const ratio of [COVER_RATIO, PERSON_RATIO]) {
      for (const [width, height] of [
        [4000, 2000],
        [600, 1600],
        [1600, 900],
        [1, 1],
      ]) {
        for (const zoom of [1, 1.5, 3]) {
          for (const x of [0, 50, 100]) {
            for (const y of [0, 50, 100]) {
              const crop = coverCrop(width, height, zoom, x, y, ratio);
              expect(crop.left).toBeGreaterThanOrEqual(0);
              expect(crop.top).toBeGreaterThanOrEqual(0);
              expect(crop.left + crop.width).toBeLessThanOrEqual(width + 1e-8);
              expect(crop.top + crop.height).toBeLessThanOrEqual(height + 1e-8);
              expect(crop.width / crop.height).toBeCloseTo(ratio);
              expect(crop.outputWidth).toBeGreaterThanOrEqual(1);
              expect(crop.outputHeight).toBeGreaterThanOrEqual(1);
              expect(crop.outputWidth).toBeLessThanOrEqual(1600);
              expect(crop.outputHeight).toBeLessThanOrEqual(1600);
            }
          }
        }
      }
    }
  });
  test("omitted ratio is exactly the 4:3 news cover", () => {
    for (const [width, height, zoom, x, y] of [
      [4000, 2000, 1, 50, 50],
      [600, 1600, 1.5, 0, 100],
      [1600, 900, 3, 100, 0],
    ]) {
      expect(coverCrop(width, height, zoom, x, y)).toEqual(
        coverCrop(width, height, zoom, x, y, COVER_RATIO),
      );
    }
    const crop = coverCrop(4000, 2000, 1, 50, 50);
    expect(crop.width / crop.height).toBeCloseTo(4 / 3);
    expect(crop.outputWidth).toBe(1600);
    expect(crop.outputHeight).toBe(1200);
  });
  test("axis slack: zero when the source already matches the frame, positive after zoom", () => {
    // CoverCropDialog блокирует ползунок оси при `source - crop < 1`.
    const exact = coverCrop(4000, 3000, 1, 50, 50, 4 / 3);
    expect(4000 - exact.width).toBe(0);
    expect(3000 - exact.height).toBe(0);
    const zoomed = coverCrop(4000, 3000, 2, 50, 50, 4 / 3);
    expect(4000 - zoomed.width).toBeGreaterThan(0);
    expect(3000 - zoomed.height).toBeGreaterThan(0);
    const wide = coverCrop(6000, 4000, 1, 50, 50, 4 / 3);
    expect(6000 - wide.width).toBeGreaterThan(0);
    expect(4000 - wide.height).toBe(0);
  });
  test("portrait photo can reach its top and bottom; export is not upscaled", () => {
    const top = coverCrop(900, 1600, 1, 50, 0);
    const bottom = coverCrop(900, 1600, 1, 50, 100);
    expect(top.top).toBe(0);
    expect(bottom.top + bottom.height).toBe(1600);
    expect(bottom.outputWidth).toBe(900);
  });
  test("3:4 on a wide source uses full height and pans to both edges", () => {
    const left = coverCrop(4000, 2000, 1, 0, 50, PERSON_RATIO);
    const right = coverCrop(4000, 2000, 1, 100, 50, PERSON_RATIO);
    expect(left.height).toBe(2000);
    expect(left.width).toBe(1500);
    expect(left.left).toBe(0);
    expect(left.top).toBe(0);
    expect(right.left + right.width).toBe(4000);
    // Длинная сторона (высота) ограничена 1600, ширина следует за ratio.
    expect(left.outputHeight).toBe(1600);
    expect(left.outputWidth).toBe(1200);
  });
  test("3:4 on a narrow source uses full width, pans top to bottom, no upscale", () => {
    const top = coverCrop(600, 1600, 1, 50, 0, PERSON_RATIO);
    const bottom = coverCrop(600, 1600, 1, 50, 100, PERSON_RATIO);
    expect(top.width).toBe(600);
    expect(top.height).toBe(800);
    expect(top.top).toBe(0);
    expect(bottom.top + bottom.height).toBe(1600);
    expect(top.outputWidth).toBe(600);
    expect(top.outputHeight).toBe(800);
  });
  test("rejects invalid image dimensions and ratio", () => {
    for (const width of [0, -1, NaN, Infinity])
      expect(() => coverCrop(width, 100, 1, 50, 50)).toThrow();
    for (const ratio of [0, -1, NaN, Infinity])
      expect(() => coverCrop(100, 100, 1, 50, 50, ratio)).toThrow();
  });
});
