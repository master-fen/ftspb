import { describe, expect, test } from "bun:test";
import {
  detectDocumentSignature,
  detectImageSignature,
  getFileExtension,
  isWithinSizeLimit,
  MAX_UPLOAD_BYTES,
} from "@/lib/image-validation";

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

describe("detectDocumentSignature — валидные пары сигнатура+расширение", () => {
  test("PDF (%PDF-) + .pdf", () => {
    const buf = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34);
    expect(detectDocumentSignature(buf, "pdf")).toBe("application/pdf");
  });

  test("ZIP (PK) + .docx", () => {
    const buf = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0);
    expect(detectDocumentSignature(buf, "docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  test("ZIP (PK) + .xlsx", () => {
    const buf = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0);
    expect(detectDocumentSignature(buf, "xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  test("OLE2 (D0 CF 11 E0 A1 B1 1A E1) + .doc", () => {
    const buf = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    expect(detectDocumentSignature(buf, "doc")).toBe("application/msword");
  });

  test("OLE2 + .xls", () => {
    const buf = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    expect(detectDocumentSignature(buf, "xls")).toBe("application/vnd.ms-excel");
  });

  test("расширение в верхнем регистре — совпадает", () => {
    const buf = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
    expect(detectDocumentSignature(buf, "PDF")).toBe("application/pdf");
  });
});

describe("detectDocumentSignature — отклонение (семейство и расширение обязаны совпасть)", () => {
  test("ZIP-сигнатура с расширением .pdf → null", () => {
    const buf = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0);
    expect(detectDocumentSignature(buf, "pdf")).toBeNull();
  });

  test("PDF-сигнатура с расширением .docx → null", () => {
    const buf = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
    expect(detectDocumentSignature(buf, "docx")).toBeNull();
  });

  test("OLE2-сигнатура с расширением .docx → null (doc/xls только)", () => {
    const buf = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    expect(detectDocumentSignature(buf, "docx")).toBeNull();
  });

  test("ZIP-сигнатура с произвольным расширением .zip → null (не docx/xlsx)", () => {
    const buf = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0);
    expect(detectDocumentSignature(buf, "zip")).toBeNull();
  });

  test("исполняемый файл (MZ-заголовок) → null при любом расширении", () => {
    const buf = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00);
    expect(detectDocumentSignature(buf, "pdf")).toBeNull();
    expect(detectDocumentSignature(buf, "docx")).toBeNull();
    expect(detectDocumentSignature(buf, "exe")).toBeNull();
  });

  test("пустой буфер → null, не падает", () => {
    expect(detectDocumentSignature(bytes(), "pdf")).toBeNull();
  });

  test("буфер короче любой сигнатуры → null, не падает", () => {
    expect(detectDocumentSignature(bytes(0x25, 0x50), "pdf")).toBeNull();
  });
});

describe("getFileExtension", () => {
  test("обычное имя файла", () => {
    expect(getFileExtension("Регламент.pdf")).toBe("pdf");
  });

  test("расширение в верхнем регистре приводится к нижнему", () => {
    expect(getFileExtension("file.PDF")).toBe("pdf");
  });

  test("несколько точек — берётся последнее расширение", () => {
    expect(getFileExtension("архив.tar.gz")).toBe("gz");
  });

  test("без точки → пустая строка", () => {
    expect(getFileExtension("filename")).toBe("");
  });

  test("точка — последний символ → пустая строка", () => {
    expect(getFileExtension("filename.")).toBe("");
  });

  test("скрытый файл без расширения (точка первым символом) → пустая строка", () => {
    expect(getFileExtension(".gitignore")).toBe("");
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
