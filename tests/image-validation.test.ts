import { describe, expect, test } from "bun:test";
import { detectImageSignature, isWithinSizeLimit, MAX_UPLOAD_BYTES } from "@/lib/image-validation";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("detectImageSignature — валидные сигнатуры", () => {
  test("JPEG (FF D8 FF)", () => {
    expect(detectImageSignature(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
  });

  test("PNG (89 50 4E 47 0D 0A 1A 0A)", () => {
    expect(detectImageSignature(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe(
      "image/png",
    );
  });

  test("GIF (47 49 46 38)", () => {
    expect(detectImageSignature(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("image/gif");
  });

  test("WebP (RIFF....WEBP)", () => {
    const buf = bytes(
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // размер, не проверяется
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
    );
    expect(detectImageSignature(buf)).toBe("image/webp");
  });
});

describe("detectImageSignature — отклонение", () => {
  test("мусорные байты → null", () => {
    expect(detectImageSignature(bytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11))).toBeNull();
  });

  test("PDF-сигнатура (%PDF) → null", () => {
    expect(detectImageSignature(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull();
  });

  test("пустой буфер → null, не падает", () => {
    expect(detectImageSignature(bytes())).toBeNull();
  });

  test("слишком короткий буфер (короче любой сигнатуры) → null, не падает", () => {
    expect(detectImageSignature(bytes(0x89, 0x50))).toBeNull();
  });

  test("RIFF без WEBP на байтах 8-11 → null", () => {
    const buf = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20); // RIFF....AVI
    expect(detectImageSignature(buf)).toBeNull();
  });
});

describe("isWithinSizeLimit", () => {
  test("ровно на границе — проходит", () => {
    expect(isWithinSizeLimit(MAX_UPLOAD_BYTES)).toBe(true);
  });

  test("на 1 байт больше границы — не проходит", () => {
    expect(isWithinSizeLimit(MAX_UPLOAD_BYTES + 1)).toBe(false);
  });

  test("ноль байт — проходит", () => {
    expect(isWithinSizeLimit(0)).toBe(true);
  });

  test("свой лимит вместо дефолтного", () => {
    expect(isWithinSizeLimit(2000, 1000)).toBe(false);
    expect(isWithinSizeLimit(500, 1000)).toBe(true);
  });
});
