import { describe, expect, test } from "bun:test";
import { countGalleryLinks, removeGalleryLink, rewriteGalleryLink } from "./archive-gallery-links";

/**
 * Тела — литералы из выгрузки `news_export_local.json` (абзац с ссылкой на
 * страницу галереи). По строке на форму, в которой ссылка стоит в архиве.
 */
const A = (p: string, text: string) => `<a href="http://tennisfed.spb.ru/${p}">${text}</a>`;
const DOC = (name: string, text: string) =>
  `<a href="archive-document:download\\news\\${name}">${text}</a>`;

describe("снятие ссылки на страницу галереи", () => {
  test("абзац из одной ссылки не публикуется", () => {
    const html = `<p>Текст.</p>\n<p>${A("photogallery_11-12_04_2006.html", "ФОТОГАЛЕРЕЯ")}</p>`;
    const r = removeGalleryLink(html, "photogallery_11-12_04_2006.html");
    expect(r).toEqual({ html: "<p>Текст.</p>", removed: 1 });
  });

  test("ссылка после «***»: уходит вместе с разделителем", () => {
    const html = `<p>${DOC("prince.xls", "СЕТКИ ТУРНИРА")} *** ${A("photogallery_26_03_2006.html", "ФОТОГАЛЕРЕЯ")}</p>`;
    const r = removeGalleryLink(html, "photogallery_26_03_2006.html");
    expect(r.html).toBe(`<p>${DOC("prince.xls", "СЕТКИ ТУРНИРА")}</p>`);
    expect(r.removed).toBe(1);
  });

  test("«***» с двух сторон: остаётся один по краям, ничего не висит", () => {
    const html = `<p>*** ${DOC("setki.xls", "Турнирная сетка")} *** ${A("photogallery_04-10_06_2007.html", "Фотогалерея турнира")} ***</p>`;
    const r = removeGalleryLink(html, "photogallery_04-10_06_2007.html");
    expect(r.html).toBe(`<p>*** ${DOC("setki.xls", "Турнирная сетка")} ***</p>`);
  });

  test("ссылка в конце <strong>: серия <br> перед ней и после неё уходит", () => {
    const html = `<p>Турнирные сетки: <br> <strong>${DOC("g.xls", "ДЕВУШКИ")} *** ${DOC("b.xls", "ЮНОШИ")} <br><br> ${A("photogallery_20130628.html", "ФОТОГАЛЕРЕЯ")}<br> </strong></p>`;
    const r = removeGalleryLink(html, "photogallery_20130628.html");
    expect(r.html).toBe(
      `<p>Турнирные сетки: <br> <strong>${DOC("g.xls", "ДЕВУШКИ")} *** ${DOC("b.xls", "ЮНОШИ")}</strong></p>`,
    );
  });

  test("две ссылки подряд посреди текста: отступ перед текстом прежний", () => {
    const p1 = "photogallery_20130629.html";
    const p2 = "photogallery_201306292.html";
    const html = `<p><strong>${DOC("v.xls", "ПАРЫ")} <br><br> ${A(p1, "ФОТОГАЛЕРЕЯ 1")}<br> <br><br> ${A(p2, "ФОТОГАЛЕРЕЯ 2")}<br> <br><br> Победители и призеры </strong></p>`;
    const r1 = removeGalleryLink(html, p1);
    expect(r1.html).toContain(A(p2, "ФОТОГАЛЕРЕЯ 2"));
    const r2 = removeGalleryLink(r1.html, p2);
    expect(r2.html).toBe(
      `<p><strong>${DOC("v.xls", "ПАРЫ")} <br><br> Победители и призеры </strong></p>`,
    );
  });

  test("три ссылки в начале <strong>: ведущие <br> уходят, текст встаёт первым", () => {
    const p = [
      "photogallery_20130702.html",
      "photogallery_20130705.html",
      "photogallery_20130706.html",
    ];
    const html = `<p><strong><br><br> ${A(p[0], "ФОТОГАЛЕРЕЯ 02.07.2013")}<br> <br> <br><br> ${A(p[1], "ФОТОГАЛЕРЕЯ 05.07.2013")}<br> <br> <br> <br><br> ${A(p[2], "ФОТОГАЛЕРЕЯ 06.07.2013")}<br> <br> <br> Турнирные сетки: <br> ${DOC("x.xls", "ДЕВУШКИ")}</strong></p>`;
    let cur = html;
    for (const page of p) cur = removeGalleryLink(cur, page).html;
    expect(cur).toBe(`<p><strong>Турнирные сетки: <br> ${DOC("x.xls", "ДЕВУШКИ")}</strong></p>`);
  });

  test("ссылка на другую страницу и соседние ссылки не тронуты", () => {
    const other = A("photogallery_20130705.html", "ФОТОГАЛЕРЕЯ 05.07.2013");
    const html = `<p>${DOC("a.xls", "СЕТКА")} *** ${A("photogallery_20130702.html", "ФОТОГАЛЕРЕЯ")} *** ${other}</p>`;
    const r = removeGalleryLink(html, "photogallery_20130702.html");
    expect(r.html).toContain(other);
    expect(r.html).toContain(DOC("a.xls", "СЕТКА"));
    expect(r.html).not.toContain("photogallery_20130702");
    expect(r.removed).toBe(1);
  });

  test("адрес другой страницы с тем же началом не совпадает", () => {
    const html = `<p>${A("photogallery_201306292.html", "ФОТОГАЛЕРЕЯ 2")}</p>`;
    expect(removeGalleryLink(html, "photogallery_20130629.html")).toEqual({ html, removed: 0 });
    expect(countGalleryLinks(html, "photogallery_20130629.html")).toBe(0);
    expect(countGalleryLinks(html, "photogallery_201306292.html")).toBe(1);
  });

  test("после снятия висячих «***» и пустых абзацев нет", () => {
    const html = `<p>${DOC("a.xls", "СЕТКА")} *** ${A("photogallery_x.html", "ФОТО")}</p>\n<p>${A("photogallery_x.html", "ФОТО")}</p>`;
    const r = removeGalleryLink(html, "photogallery_x.html");
    expect(r.removed).toBe(2);
    expect(r.html).not.toMatch(/\*\*\*\s*<\/p>/);
    expect(r.html).not.toContain("<p></p>");
  });
});

describe("переписывание ссылки на страницу галереи", () => {
  test("href становится меткой на запись, видимый текст остаётся", () => {
    const page = "photogallery_09-17_07_2011.html";
    const src = "https://www.tennisfed.spb.ru/photogallery_09-17_07_2011.html";
    const html = `<p>${A(page, "ФОТОГАЛЕРЕЯ ТУРНИРА")}</p>`;
    const r = rewriteGalleryLink(html, page, src);
    expect(r).toEqual({
      html: `<p><a href="archive-record:${src}">ФОТОГАЛЕРЕЯ ТУРНИРА</a></p>`,
      rewritten: 1,
    });
  });

  test("чужая страница не переписывается", () => {
    const html = `<p>${A("photogallery_other.html", "ФОТО")}</p>`;
    expect(rewriteGalleryLink(html, "photogallery_x.html", "s")).toEqual({ html, rewritten: 0 });
  });
});
