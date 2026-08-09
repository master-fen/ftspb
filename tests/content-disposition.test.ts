import { describe, expect, test } from "bun:test";
import { buildContentDisposition, MAX_TITLE_LENGTH } from "@/lib/content-disposition";

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
