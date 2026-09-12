import { describe, expect, test } from "bun:test";
import {
  classifyPair,
  fileNameForPath,
  normalizeHtml,
  sortManifestPreloads,
  statusMismatch,
} from "./ssr-snapshot";

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

// Форма строки манифеста — как в нормализованном снимке сборки.
const manifestLine = (root: string[], route: string[], key = "/_site") =>
  '<script class="$tsr" id="$tsr-stream-barrier">(self.$R=self.$R||{})["tsr"]=[];' +
  `$R[1]={routes:$R[2]={__root__:$R[3]={preloads:$R[4]=[${root.map((p) => `"${p}"`).join(",")}]},` +
  `"${key}":$R[8]={preloads:$R[9]=[${route.map((p) => `"${p}"`).join(",")}]}}};</script>`;
const page = (manifest: string, heading = '<h1 class="ui-h1">Заголовок</h1>') =>
  ["<main>", heading, "</main>", manifest].join("\n");

const ROOT = ["/assets/index-HASH.js", "/assets/root-HASH.js"];
const ROUTE = ["/assets/_site-HASH.js", "/assets/x-HASH.js", "/assets/_site-HASH.js"];
// ROUTE — палиндром, reverse() его не меняет; перестановка — только так.
const ROUTE_SHUFFLED = [ROUTE[1], ROUTE[2], ROUTE[0]];

describe("sortManifestPreloads", () => {
  test("сортирует элементы внутри каждого массива preloads, остальное не трогает", () => {
    expect(
      sortManifestPreloads('a:1,preloads:$R[4]=["/b","/a"],c:2,preloads:$R[9]=["/z","/y"]'),
    ).toBe('a:1,preloads:$R[4]=["/a","/b"],c:2,preloads:$R[9]=["/y","/z"]');
  });

  test("пустой массив остаётся пустым", () => {
    expect(sortManifestPreloads("preloads:$R[4]=[]")).toBe("preloads:$R[4]=[]");
  });
});

describe("classifyPair — ветка «только манифест»", () => {
  test("переставлены элементы одного массива preloads → manifest, номер строки манифеста", () => {
    const a = page(manifestLine(ROOT, ROUTE));
    const b = page(manifestLine(ROOT, ROUTE_SHUFFLED));
    expect(ROUTE_SHUFFLED).not.toEqual(ROUTE);
    expect(classifyPair(a, b)).toEqual({ kind: "manifest", lines: [4] });
  });

  test("переставлены оба массива → manifest", () => {
    const a = page(manifestLine(ROOT, ROUTE));
    const b = page(manifestLine([...ROOT].reverse(), ROUTE_SHUFFLED));
    expect(classifyPair(a, b)).toEqual({ kind: "manifest", lines: [4] });
  });
});

describe("classifyPair — ветка «прочее»", () => {
  test("изменён класс при переставленном манифесте → other: строка класса и строка манифеста раздельно", () => {
    const a = page(manifestLine(ROOT, ROUTE));
    const b = page(manifestLine(ROOT, ROUTE_SHUFFLED), '<h1 class="text-3xl">Заголовок</h1>');
    expect(classifyPair(a, b)).toEqual({
      kind: "other",
      reason: "различие не в порядке preloads",
      lines: [2],
      manifestLines: [4],
    });
  });

  test("элемент preloads заменён другим → other", () => {
    const a = page(manifestLine(ROOT, ROUTE));
    const b = page(manifestLine(ROOT, [ROUTE[0], "/assets/y-HASH.js", ROUTE[2]]));
    expect(classifyPair(a, b)).toMatchObject({ kind: "other", lines: [4] });
  });

  test("элемент preloads убран (повтор схлопнулся) → other", () => {
    const a = page(manifestLine(ROOT, ROUTE));
    const b = page(manifestLine(ROOT, ROUTE.slice(0, 2)));
    expect(classifyPair(a, b)).toMatchObject({ kind: "other", lines: [4] });
  });

  test("строка манифеста отличается вне preloads → other", () => {
    const a = page(manifestLine(ROOT, ROUTE));
    const b = page(manifestLine(ROOT, ROUTE, "/_site/news"));
    expect(classifyPair(a, b)).toMatchObject({ kind: "other", lines: [4] });
  });

  test("переставленный массив preloads не в строке манифеста → other", () => {
    const line = (items: string[]) => `<script>preloads:$R[4]=[${items.join(",")}]</script>`;
    expect(classifyPair(line(["1", "2"]), line(["2", "1"]))).toMatchObject({
      kind: "other",
      lines: [1],
    });
  });

  test("разное число строк → other без номеров", () => {
    const a = page(manifestLine(ROOT, ROUTE));
    expect(classifyPair(a, `${a}\n<p>x</p>`)).toEqual({
      kind: "other",
      reason: "строк 4 и 5",
      lines: [],
      manifestLines: [],
    });
  });
});

describe("classifyPair — контроли", () => {
  test("положительный: один текст дважды → same", () => {
    const a = page(manifestLine(ROOT, ROUTE));
    expect(classifyPair(a, a)).toEqual({ kind: "same" });
  });

  test("отрицательный: разный текст → не same", () => {
    expect(classifyPair("<p>a</p>", "<p>b</p>").kind).not.toBe("same");
  });
});

describe("fileNameForPath", () => {
  test("корень — index, вложенный путь — через __, хвостовой слэш не влияет", () => {
    expect(fileNameForPath("/")).toBe("index");
    expect(fileNameForPath("/federation/events")).toBe("federation__events");
    expect(fileNameForPath("/news/")).toBe("news");
  });
});

describe("statusMismatch", () => {
  test("статус совпал — отказа нет (200 и 404)", () => {
    expect(statusMismatch("/news", 200, 200)).toBeNull();
    expect(statusMismatch("/news/x", 404, 404)).toBeNull();
  });

  test("статус не совпал — отказ с обоими статусами", () => {
    expect(statusMismatch("/news/x", 200, 404)).toBe("/news/x → HTTP 200, ожидался 404");
    expect(statusMismatch("/news", 404, 200)).toBe("/news → HTTP 404, ожидался 200");
  });
});
