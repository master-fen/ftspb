import { describe, expect, test } from "bun:test";
import {
  buildContentDisposition,
  MAX_TITLE_LENGTH,
  sanitizeTitle,
} from "@/lib/content-disposition";

function parse(header: string): { asciiFallback: string; decoded: string } {
  const match = header.match(/^inline; filename="([^"]*)"; filename\*=UTF-8''(.+)$/);
  if (!match) {
    throw new Error(`Заголовок не соответствует ожидаемому формату: ${header}`);
  }
  return { asciiFallback: match[1], decoded: decodeURIComponent(match[2]) };
}

describe("buildContentDisposition", () => {
  test("кириллица: filename* — percent-encoded UTF-8, filename — ASCII-фолбэк", () => {
    const header = buildContentDisposition("Регламент", "pdf");
    const { asciiFallback, decoded } = parse(header);
    expect(decoded).toBe("Регламент.pdf");
    expect(asciiFallback).toBe("_________.pdf");
  });

  test("режим inline, не attachment", () => {
    const header = buildContentDisposition("Название", "pdf");
    expect(header.startsWith("inline; ")).toBe(true);
  });

  test("запрещённые символы имени файла вычищаются", () => {
    const header = buildContentDisposition('Приказ №5 / "важный" <черновик>: срочно', "pdf");
    const { asciiFallback, decoded } = parse(header);
    expect(decoded).not.toMatch(/[/\\:*?"<>|]/);
    expect(asciiFallback).not.toMatch(/[/\\:*?"<>|]/);
  });

  test("управляющие символы (включая CR/LF) вычищаются — защита от инъекции в заголовок", () => {
    const header = buildContentDisposition("Название\r\nX-Evil: 1", "pdf");
    expect(header).not.toMatch(/[\r\n]/);
    const { decoded } = parse(header);
    expect(decoded).toBe("НазваниеX-Evil 1.pdf");
  });

  test("пустое название → фолбэк document", () => {
    const header = buildContentDisposition("", "pdf");
    expect(header).toContain('filename="document.pdf"');
    expect(header).toContain("filename*=UTF-8''document.pdf");
  });

  test("название из одних запрещённых символов → фолбэк document", () => {
    const header = buildContentDisposition('///\\\\:::""', "pdf");
    expect(header).toContain('filename="document.pdf"');
  });

  test("очень длинное название обрезается до MAX_TITLE_LENGTH", () => {
    const longTitle = "а".repeat(500);
    const header = buildContentDisposition(longTitle, "pdf");
    const { decoded } = parse(header);
    const base = decoded.slice(0, -".pdf".length);
    expect(base.length).toBe(MAX_TITLE_LENGTH);
  });
});

describe("sanitizeTitle", () => {
  test("длина до вычистки и после могут различаться: запрещённые символы уменьшают длину", () => {
    // 200 обычных символов + 5 запрещённых (двоеточия) = 205 символов в
    // исходной строке, но ровно 200 после вычистки — проверка длины в
    // upload.ts обязана сравнивать с MAX_TITLE_LENGTH именно эту, вторую
    // величину, а не raw.length.
    const raw = "а".repeat(200) + ":".repeat(5);
    expect(raw.length).toBe(205);
    const sanitized = sanitizeTitle(raw);
    expect(sanitized.length).toBe(200);
    expect(sanitized.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  test("buildContentDisposition с той же строкой не обрезает дальше — она уже укладывается в лимит", () => {
    const raw = "а".repeat(200) + ":".repeat(5);
    const header = buildContentDisposition(raw, "pdf");
    const { decoded } = parse(header);
    const base = decoded.slice(0, -".pdf".length);
    expect(base.length).toBe(200);
  });
});
