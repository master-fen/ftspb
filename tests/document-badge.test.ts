import { describe, expect, test } from "bun:test";

import { documentBadge } from "@/lib/document-badge";

describe("documentBadge", () => {
  test("PDF по mime независимо от имени файла", () => {
    expect(documentBadge("application/pdf", "ustav.bin")).toBe("PDF");
  });

  test("офисные форматы по mime", () => {
    expect(
      documentBadge(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "reglament.docx",
      ),
    ).toBe("DOCX");
    expect(documentBadge("application/msword", "reglament.doc")).toBe("DOC");
    expect(
      documentBadge(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "smeta.xlsx",
      ),
    ).toBe("XLSX");
    expect(documentBadge("application/vnd.ms-excel", "smeta.xls")).toBe("XLS");
    expect(
      documentBadge(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "deck.pptx",
      ),
    ).toBe("PPTX");
  });

  test("mime сравнивается без учёта регистра и пробелов", () => {
    expect(documentBadge(" Application/PDF ", "x")).toBe("PDF");
  });

  test("неизвестный mime — расширение файла прописными", () => {
    expect(documentBadge("application/zip", "archive.zip")).toBe("ZIP");
    expect(documentBadge("application/octet-stream", "photo.JPG")).toBe("JPG");
    expect(documentBadge("application/octet-stream", "a.b.c.txt")).toBe("TXT");
  });

  test("расширение длиннее четырёх символов или с посторонними знаками — FILE", () => {
    expect(documentBadge("application/octet-stream", "data.sqlite")).toBe("FILE");
    expect(documentBadge("application/octet-stream", "name.a b")).toBe("FILE");
  });

  test("без расширения — FILE", () => {
    expect(documentBadge("application/octet-stream", "README")).toBe("FILE");
    expect(documentBadge("application/octet-stream", ".htaccess")).toBe("FILE");
    expect(documentBadge("application/octet-stream", "name.")).toBe("FILE");
  });
});
