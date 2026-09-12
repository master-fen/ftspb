import { describe, expect, test } from "bun:test";
import { fileNameForPath, normalizeHtml } from "./ssr-snapshot";

const UI_LINK_MAP = { "ui-link": "transition-colors hover:text-brand-orange" };

describe("normalizeHtml — правила", () => {
  test("1) хэш в имени ассета заменяется на HASH, имя и расширение остаются", () => {
    const { html } = normalizeHtml(
      '<script src="/assets/index-Ab_c-D12.js"></script><link rel="stylesheet" href="/assets/styles-9fK2x0Lm.css">',
    );
    expect(html).toBe(
      '<script src="/assets/index-HASH.js">\n</script>\n<link rel="stylesheet" href="/assets/styles-HASH.css">',
    );
  });

  test("2) u: и 13 цифр → u:STREAM", () => {
    const { html } = normalizeHtml("<script>$R[0]=u:1757666123456;</script>");
    expect(html).toBe("<script>$R[0]=u:STREAM;</script>");
  });

  test("3) атрибут data-tsd-source удаляется целиком", () => {
    const { html } = normalizeHtml('<div data-tsd-source="/src/a.tsx:12:3" class="p-2">x</div>');
    expect(html).toBe('<div class="p-2">x</div>');
  });

  test("4) >< разбивается переводом строки", () => {
    const { html } = normalizeHtml("<ul><li>a</li><li>b</li></ul>");
    expect(html).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
  });

  test("5) строки preload изымаются в список: уникальные пути, по порядку", () => {
    const { html, preloads } = normalizeHtml(
      [
        '<link rel="modulepreload" href="/assets/z-11111111.js">',
        '<link rel="modulepreload" href="/assets/a-22222222.js">',
        '<link rel="modulepreload" href="/assets/z-33333333.js">',
        '<link rel="preload" as="style" href="/assets/styles-44444444.css">',
        "<main>x</main>",
      ].join(""),
    );
    expect(html).toBe("<main>x</main>");
    expect(preloads).toEqual(["/assets/a-HASH.js", "/assets/styles-HASH.css", "/assets/z-HASH.js"]);
  });

  test("6) с картой: токен разворачивается, токены сортируются", () => {
    const { html } = normalizeHtml('<a class="text-brand-blue ui-link font-bold">x</a>', {
      classMap: UI_LINK_MAP,
    });
    expect(html).toBe(
      '<a class="font-bold hover:text-brand-orange text-brand-blue transition-colors">x</a>',
    );
  });

  test("6) с картой: разметка до и после замены на утилиту совпадает", () => {
    const before =
      '<a class="font-bold text-brand-blue transition-colors hover:text-brand-orange">';
    const after = '<a class="font-bold text-brand-blue ui-link">';
    expect(normalizeHtml(before, { classMap: UI_LINK_MAP }).html).toBe(
      normalizeHtml(after, { classMap: UI_LINK_MAP }).html,
    );
  });

  test("6) без карты токены класса не трогаются", () => {
    const { html } = normalizeHtml('<a class="z ui-link a">x</a>');
    expect(html).toBe('<a class="z ui-link a">x</a>');
  });
});

describe("normalizeHtml — контроли компаратора", () => {
  test("положительный: одна строка дважды → тождество", () => {
    const page = '<main class="p-4"><a href="/news" data-tsd-source="/x.tsx:1:1">x</a></main>';
    expect(normalizeHtml(page)).toEqual(normalizeHtml(page));
  });

  test("отрицательный: две разные строки → различие", () => {
    const a = normalizeHtml('<main class="p-4"><a href="/news">Новости</a></main>');
    const b = normalizeHtml('<main class="p-4"><a href="/documents">Документы</a></main>');
    expect(a.html).not.toBe(b.html);
  });
});

describe("fileNameForPath", () => {
  test("корень — index, вложенный путь — через __, хвостовой слэш не влияет", () => {
    expect(fileNameForPath("/")).toBe("index");
    expect(fileNameForPath("/federation/events")).toBe("federation__events");
    expect(fileNameForPath("/news/")).toBe("news");
  });
});
