import { describe, expect, test } from "bun:test";
import { coverCrop, COVER_RATIO } from "@/lib/cover-crop";

describe("cover cropping", () => {
  test("pan and zoom never expose empty pixels, including portrait and tiny images", () => {
    for (const [width, height] of [
      [4000, 2000],
      [600, 1600],
      [1600, 900],
      [1, 1],
    ]) {
      for (const zoom of [1, 1.5, 3]) {
        for (const x of [0, 50, 100]) {
          for (const y of [0, 50, 100]) {
            const crop = coverCrop(width, height, zoom, x, y);
            expect(crop.left).toBeGreaterThanOrEqual(0);
            expect(crop.top).toBeGreaterThanOrEqual(0);
            expect(crop.left + crop.width).toBeLessThanOrEqual(width + 1e-8);
            expect(crop.top + crop.height).toBeLessThanOrEqual(height + 1e-8);
            expect(crop.width / crop.height).toBeCloseTo(COVER_RATIO);
            expect(crop.outputWidth).toBeGreaterThanOrEqual(1);
            expect(crop.outputHeight).toBeGreaterThanOrEqual(1);
            expect(crop.outputWidth).toBeLessThanOrEqual(1600);
          }
        }
      }
    }
  });
  test("portrait photo can reach its top and bottom; export is not upscaled", () => {
    const top = coverCrop(900, 1600, 1, 50, 0);
    const bottom = coverCrop(900, 1600, 1, 50, 100);
    expect(top.top).toBe(0);
    expect(bottom.top + bottom.height).toBe(1600);
    expect(bottom.outputWidth).toBe(900);
  });
  test("rejects invalid image dimensions", () => {
    for (const width of [0, -1, NaN, Infinity])
      expect(() => coverCrop(width, 100, 1, 50, 50)).toThrow();
  });
});
