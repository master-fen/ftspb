import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  NEWS_FILE_PREFIX,
  newsFileHref,
  newsFileKey,
  newsFileVerdict,
  type NewsFileRow,
} from "@/lib/news-file-url";

const SLUG = "perehodyaschiy-kubok-dzhentlmenov-etap-08-noyabrya";
const KEY = `news/${SLUG}/documents/01.xls`;

/** Строка выборки «всё в порядке»; поля переопределяются по месту. */
const row = (patch: Partial<NewsFileRow> = {}): NewsFileRow => ({
  s3Key: KEY,
  documentPublished: true,
  documentDeleted: false,
  newsPublished: true,
  newsDeleted: false,
  ...patch,
});

describe("newsFileHref / newsFileKey", () => {
  test("адрес собирается из слага и имени файла", () => {
    expect(newsFileHref(SLUG, "01.xls")).toBe(`${NEWS_FILE_PREFIX}/${SLUG}/01.xls`);
  });

  test("круговой проход: адрес мигратора разбирается маршрутом в тот же ключ", () => {
    const href = newsFileHref(SLUG, "01.xls");
    const [, prefix, slug, file] = href.split("/");
    expect(`/${prefix}`).toBe(NEWS_FILE_PREFIX);
    expect(newsFileKey({ slug, file })).toBe(KEY);
  });

  test("ключ собирается из сегментов и всегда лежит под news/…/documents/", () => {
    expect(newsFileKey({ slug: SLUG, file: "01.xls" })).toBe(KEY);
    expect(newsFileKey({ slug: "a", file: "12.pdf" })).toBe("news/a/documents/12.pdf");
  });

  test("выход за префикс через .. — 404 (ключ не собирается)", () => {
    expect(newsFileKey({ slug: "..", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: "../..", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: SLUG, file: "../01.xls" })).toBeNull();
    expect(newsFileKey({ slug: SLUG, file: ".." })).toBeNull();
  });

  test("кодированные разделители и обратные слэши не проходят", () => {
    // Маршрутизатор отдаёт параметры уже раскодированными, поэтому проверяются
    // обе формы: и декодированная, и оставшаяся в процентах.
    expect(newsFileKey({ slug: "a/b", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: "a%2Fb", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: "a%2e%2e", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: "a\\b", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: SLUG, file: "01%2exls" })).toBeNull();
  });

  test("чужой префикс в сегменте слага не пролезает", () => {
    expect(newsFileKey({ slug: "documents", file: "01.xls" })).toBe(
      "news/documents/documents/01.xls",
    );
    expect(newsFileKey({ slug: "news/other", file: "01.xls" })).toBeNull();
  });

  test("имя файла не той формы — 404", () => {
    expect(newsFileKey({ slug: SLUG, file: "1.xls" })).toBeNull();
    expect(newsFileKey({ slug: SLUG, file: "001.xls" })).toBeNull();
    expect(newsFileKey({ slug: SLUG, file: "01" })).toBeNull();
    expect(newsFileKey({ slug: SLUG, file: "01.XLS" })).toBeNull();
    expect(newsFileKey({ slug: SLUG, file: "cover.jpg" })).toBeNull();
    expect(newsFileKey({ slug: SLUG, file: "" })).toBeNull();
  });

  test("слаг не той формы — 404", () => {
    expect(newsFileKey({ slug: "", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: "-abc", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: "abc-", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: "a--b", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: "Кубок", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: "ABC", file: "01.xls" })).toBeNull();
    expect(newsFileKey({ slug: "a".repeat(201), file: "01.xls" })).toBeNull();
  });
});

describe("newsFileVerdict", () => {
  test("существующий файл — перенаправление на адрес хранилища", () => {
    const v = newsFileVerdict([row()]);
    expect(v).toEqual({ ok: true, s3Key: KEY });
  });

  test("ключ не совпал ни с одним документом — 404", () => {
    const v = newsFileVerdict([]);
    expect(v.ok).toBe(false);
  });

  test("слаг новости сменён после заливки — старый адрес файла работает", () => {
    // Выборка идёт по ключу хранилища, а он после заливки не меняется:
    // строка нашлась, хотя новость давно живёт под другим адресом.
    const v = newsFileVerdict([row()]);
    expect(v).toEqual({ ok: true, s3Key: KEY });
    // Ключ собран из СТАРОГО слага, и это единственное условие выборки.
    expect(newsFileKey({ slug: SLUG, file: "01.xls" })).toBe(KEY);
  });

  test("новость — черновик: 404", () => {
    const v = newsFileVerdict([row({ newsPublished: false })]);
    expect(v).toEqual({ ok: false, причина: "новость не опубликована" });
  });

  test("новость мягко удалена: 404", () => {
    const v = newsFileVerdict([row({ newsDeleted: true })]);
    expect(v).toEqual({ ok: false, причина: "новость удалена" });
  });

  test("документ мягко удалён: 404", () => {
    const v = newsFileVerdict([row({ documentDeleted: true })]);
    expect(v).toEqual({ ok: false, причина: "документ удалён" });
  });

  test("документ не опубликован: 404", () => {
    const v = newsFileVerdict([row({ documentPublished: false })]);
    expect(v).toEqual({ ok: false, причина: "документ не опубликован" });
  });

  test("документ привязан только к черновику и к удалённой новости — 404", () => {
    const v = newsFileVerdict([row({ newsPublished: false }), row({ newsDeleted: true })]);
    expect(v.ok).toBe(false);
  });

  test("хотя бы одна живая новость среди привязанных — перенаправление", () => {
    const v = newsFileVerdict([row({ newsDeleted: true }), row()]);
    expect(v).toEqual({ ok: true, s3Key: KEY });
  });
});

describe("файл новости не зависит от «в общем списке документов»", () => {
  // Архивные документы мигратор пишет с in_library = false
  // (scripts/archive-document-values.ts); открываться из новости они обязаны.
  // Флаг не выбирается маршрутом и не входит в NewsFileRow — значит, решение
  // от него не зависит. Проверяется по исходникам: выборку маршрута без базы
  // не исполнить.
  const root = path.resolve(import.meta.dir, "..");
  for (const file of ["src/routes/news-file.$slug.$file.ts", "src/lib/news-file-url.ts"]) {
    test(`${file} не читает inLibrary`, () => {
      const source = fs.readFileSync(path.join(root, file), "utf-8");
      expect(source.length).toBeGreaterThan(0);
      expect(source.match(/inLibrary|in_library/g) ?? []).toEqual([]);
    });
  }

  test("решение принимается по пяти полям, флага среди них нет", () => {
    expect(Object.keys(row()).sort()).toEqual([
      "documentDeleted",
      "documentPublished",
      "newsDeleted",
      "newsPublished",
      "s3Key",
    ]);
  });
});
