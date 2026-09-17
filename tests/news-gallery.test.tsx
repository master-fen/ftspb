import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NewsGallery } from "@/components/site/NewsGallery";

/*
 * Разметка фотоблока новости: одно большое фото и один ряд миниатюр (три ниже
 * sm, четыре от sm), остальное — только в лайтбоксе. Лайтбокс при
 * `openIndex === null` не рисуется, портал серверному рендеру не мешает.
 *
 * Каждое утверждение о плашке привязано к своей плитке и к её видимости:
 * «в разметке есть +7 и +6» проверкой не является — оно проходит и тогда, когда
 * плашки поменялись местами. Классы читаются у самой кнопки и у самой плашки, а
 * не поиском подстроки по фрагменту: внутри кнопки лежит ещё и обёртка
 * NewsImage со своим `relative`.
 */

const photo = (i: number) => `/img/${i}.jpg`;
/** cover = /img/0.jpg, gallery = /img/1.jpg … /img/n.jpg */
const gallery = (n: number) => Array.from({ length: n }, (_, i) => photo(i + 1));

/** Фрагмент разметки кнопки, внутри которой лежит фото с этим src. */
function buttonFor(html: string, src: string): string {
  const at = html.indexOf(`src="${src}"`);
  expect(at).toBeGreaterThan(-1);
  const from = html.lastIndexOf("<button", at);
  return html.slice(from, html.indexOf("</button>", at) + "</button>".length);
}

/** Значение class у самой кнопки (не у её содержимого). */
function buttonClass(html: string, src: string): string {
  const fragment = buttonFor(html, src);
  const openTag = fragment.slice(0, fragment.indexOf(">") + 1);
  return /class="([^"]*)"/.exec(openTag)?.[1] ?? "";
}

/** Плашка «+N» внутри кнопки: её class и текст. `null` — плашки нет. */
function plaqueIn(html: string, src: string): { cls: string; text: string } | null {
  const m = /<span([^>]*aria-hidden="true"[^>]*)>([^<]*)<\/span>/.exec(buttonFor(html, src));
  return m ? { cls: /class="([^"]*)"/.exec(m[1])?.[1] ?? "", text: m[2] } : null;
}

/** Сколько кнопок в ряду миниатюр: все кнопки, кроме кнопки большого фото. */
function thumbCount(html: string): number {
  return (html.match(/<button/g) ?? []).length - 1;
}

/** src большого фото — у img внутри figure. */
function heroSrc(html: string): string | null {
  const figure = html.indexOf("<figure");
  if (figure < 0) return null;
  return /<img[^>]*src="([^"]*)"/.exec(html.slice(figure))?.[1] ?? null;
}

test("а) обложка и 10 фото: ряд из четырёх, плашки +7 ниже sm и +6 от sm", () => {
  const html = renderToStaticMarkup(
    <NewsGallery cover={photo(0)} gallery={gallery(10)} title="Заголовок" />,
  );
  expect(thumbCount(html)).toBe(4);
  expect(heroSrc(html)).toBe(photo(0));

  // images[3] — последняя плитка ряда из трёх: её плашка живёт только ниже sm.
  expect(plaqueIn(html, photo(3))?.text).toBe("+7");
  expect(plaqueIn(html, photo(3))?.cls).toContain("sm:hidden");
  expect(buttonClass(html, photo(3))).not.toContain("hidden sm:block");
  expect(buttonClass(html, photo(3))).toContain("relative");

  // images[4] — четвёртая плитка: ниже sm её нет вовсе, плашке sm:hidden не нужен.
  expect(plaqueIn(html, photo(4))?.text).toBe("+6");
  expect(plaqueIn(html, photo(4))?.cls).not.toContain("sm:hidden");
  expect(buttonClass(html, photo(4))).toContain("hidden sm:block");

  for (const src of [photo(1), photo(2)]) {
    expect(plaqueIn(html, src)).toBeNull();
    expect(buttonClass(html, src)).not.toContain("relative");
  }
});

test("б) обложка и 3 фото: три миниатюры, ни плашек, ни relative", () => {
  const html = renderToStaticMarkup(
    <NewsGallery cover={photo(0)} gallery={gallery(3)} title="Заголовок" />,
  );
  expect(thumbCount(html)).toBe(3);
  for (const src of [photo(1), photo(2), photo(3)]) {
    expect(plaqueIn(html, src)).toBeNull();
    expect(buttonClass(html, src)).not.toContain("relative");
  }
});

test("в) обложка и 4 фото: плашка +1 только ниже sm, у четвёртой плитки её нет", () => {
  const html = renderToStaticMarkup(
    <NewsGallery cover={photo(0)} gallery={gallery(4)} title="Заголовок" />,
  );
  expect(thumbCount(html)).toBe(4);

  expect(plaqueIn(html, photo(3))?.text).toBe("+1");
  expect(plaqueIn(html, photo(3))?.cls).toContain("sm:hidden");

  // От sm видны все пять фото — прятать нечего, плашки у четвёртой плитки нет.
  expect(plaqueIn(html, photo(4))).toBeNull();
  expect(buttonClass(html, photo(4))).toContain("hidden sm:block");
  expect(html).not.toContain("+0");
});

test("г) без обложки, 6 фото: большое — первое из галереи, плашки +2 и +1", () => {
  const list = gallery(6);
  const html = renderToStaticMarkup(<NewsGallery gallery={list} title="Заголовок" />);
  expect(thumbCount(html)).toBe(4);
  expect(heroSrc(html)).toBe(list[0]);

  // Большим стало первое фото галереи, ряд начинается со второго.
  expect(plaqueIn(html, list[3])?.text).toBe("+2");
  expect(plaqueIn(html, list[3])?.cls).toContain("sm:hidden");
  expect(buttonClass(html, list[3])).not.toContain("hidden sm:block");

  expect(plaqueIn(html, list[4])?.text).toBe("+1");
  expect(plaqueIn(html, list[4])?.cls).not.toContain("sm:hidden");
  expect(buttonClass(html, list[4])).toContain("hidden sm:block");
});
