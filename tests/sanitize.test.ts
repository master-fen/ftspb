import { describe, expect, test } from "bun:test";
import { sanitizeBody } from "@/server/sanitize";

describe("sanitizeBody — негативные случаи", () => {
  test("script вырезается вместе с содержимым", () => {
    const result = sanitizeBody("<script>alert(1)</script>");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("<script");
  });

  test("img с onerror вырезается целиком", () => {
    const result = sanitizeBody("<img src=x onerror=alert(1)>");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("<img");
  });

  test("javascript: в href снимается, тег и текст остаются", () => {
    const result = sanitizeBody('<a href="javascript:alert(1)">x</a>');
    expect(result).not.toContain("javascript:");
    expect(result).toContain("<a");
    expect(result).toContain("x");
  });

  test("iframe вырезается вместе с содержимым", () => {
    const result = sanitizeBody('<iframe src="https://example.com"></iframe>');
    expect(result).not.toContain("iframe");
  });

  test("onclick снимается, тег p остаётся", () => {
    const result = sanitizeBody('<p onclick="alert(1)">x</p>');
    expect(result).not.toContain("onclick");
    expect(result).toBe("<p>x</p>");
  });

  test("data: в href снимается, тег и текст остаются", () => {
    const result = sanitizeBody('<a href="data:text/html,hi">x</a>');
    expect(result).not.toContain("data:");
    expect(result).toContain("<a");
    expect(result).toContain("x");
  });
});

describe("sanitizeBody — положительные случаи", () => {
  test("p сохраняется", () => {
    expect(sanitizeBody("<p>текст</p>")).toBe("<p>текст</p>");
  });

  test("strong сохраняется", () => {
    expect(sanitizeBody("<strong>жирный</strong>")).toBe("<strong>жирный</strong>");
  });

  test("em сохраняется", () => {
    expect(sanitizeBody("<em>курсив</em>")).toBe("<em>курсив</em>");
  });

  test("u сохраняется", () => {
    expect(sanitizeBody("<u>подчёркнутый</u>")).toBe("<u>подчёркнутый</u>");
  });

  test("ul+li сохраняется", () => {
    expect(sanitizeBody("<ul><li>раз</li><li>два</li></ul>")).toBe(
      "<ul><li>раз</li><li>два</li></ul>",
    );
  });

  test("ol+li сохраняется", () => {
    expect(sanitizeBody("<ol><li>раз</li><li>два</li></ol>")).toBe(
      "<ol><li>раз</li><li>два</li></ol>",
    );
  });

  test("h2 сохраняется", () => {
    expect(sanitizeBody("<h2>заголовок</h2>")).toBe("<h2>заголовок</h2>");
  });

  test("h3 сохраняется", () => {
    expect(sanitizeBody("<h3>подзаголовок</h3>")).toBe("<h3>подзаголовок</h3>");
  });

  test("blockquote сохраняется", () => {
    expect(sanitizeBody("<blockquote>цитата</blockquote>")).toBe("<blockquote>цитата</blockquote>");
  });

  test("a с http сохраняется", () => {
    const result = sanitizeBody('<a href="http://example.com">ссылка</a>');
    expect(result).toContain('href="http://example.com"');
  });

  test("a с https сохраняется", () => {
    const result = sanitizeBody('<a href="https://example.com">ссылка</a>');
    expect(result).toContain('href="https://example.com"');
  });

  test("a с mailto сохраняется", () => {
    const result = sanitizeBody('<a href="mailto:test@example.com">почта</a>');
    expect(result).toContain('href="mailto:test@example.com"');
  });
});

describe("sanitizeBody — rel на ссылках", () => {
  test('сохранённая ссылка получает rel="noopener noreferrer"', () => {
    const result = sanitizeBody('<a href="https://example.com">ссылка</a>');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  test("rel принудительно проставляется, даже если передан другой", () => {
    const result = sanitizeBody('<a href="https://example.com" rel="nofollow">ссылка</a>');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).not.toContain("nofollow");
  });
});
