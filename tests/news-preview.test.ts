import { describe, expect, test } from "bun:test";
import {
  isNewsId,
  newsPreviewPath,
  newsShareLinkPath,
  newsShareUrl,
  PREVIEW_STATES,
  previewTitle,
  previewWindowName,
  shareKeyParam,
  shareNotice,
} from "@/lib/news-preview";

const ID = "0b3c5a52-6a4e-4f0e-9d7b-2f1d3c4e5a6b";

describe("isNewsId — форма uuid", () => {
  test("uuid в нижнем и верхнем регистре — да", () => {
    expect(isNewsId(ID)).toBe(true);
    expect(isNewsId(ID.toUpperCase())).toBe(true);
  });

  test("мусор, пустая строка, uuid с хвостом или без дефисов — нет", () => {
    for (const value of ["", "abc", "preview", `${ID}x`, ` ${ID}`, ID.replaceAll("-", "")]) {
      expect(isNewsId(value)).toBe(false);
    }
  });
});

describe("адрес и имя окна", () => {
  test("newsPreviewPath и previewWindowName — по id", () => {
    expect(newsPreviewPath(ID)).toBe(`/news/preview/${ID}`);
    expect(previewWindowName(ID)).toBe(`ftspb-news-preview-${ID}`);
  });
});

describe("тексты по состоянию", () => {
  test("PREVIEW_STATES: три текста полосы дословно", () => {
    expect({
      draft: PREVIEW_STATES.draft.notice,
      published: PREVIEW_STATES.published.notice,
      deleted: PREVIEW_STATES.deleted.notice,
    }).toEqual({
      draft: "Черновик. Посетители сайта эту новость пока не видят.",
      published: "Опубликована. Так новость видят посетители.",
      deleted: "Удалена. Посетители сайта эту новость не видят.",
    });
  });

  test("previewTitle: слово по состоянию", () => {
    expect(previewTitle("draft", "Турнир")).toBe(
      "Черновик: Турнир — Федерация тенниса Санкт-Петербурга",
    );
    expect(previewTitle("published", "Турнир")).toBe(
      "Опубликована: Турнир — Федерация тенниса Санкт-Петербурга",
    );
    expect(previewTitle("deleted", "Турнир")).toBe(
      "Удалена: Турнир — Федерация тенниса Санкт-Петербурга",
    );
  });
});

describe("ссылка согласования", () => {
  const TOKEN = "Jk3s0vYb2Q9xXlq7pZr1mWc4tUe8aHn6dGf5yBo-_Ai";

  test("newsShareLinkPath и newsShareUrl — тот же маршрут с ?key=", () => {
    expect(newsShareLinkPath(ID, TOKEN)).toBe(`/news/preview/${ID}?key=${TOKEN}`);
    expect(newsShareUrl("https://spbtennisfed.ru", ID, TOKEN)).toBe(
      `https://spbtennisfed.ru/news/preview/${ID}?key=${TOKEN}`,
    );
  });

  test("shareKeyParam: нет — undefined, строка — как есть, иное — пустая строка", () => {
    expect(shareKeyParam(undefined)).toBeUndefined();
    expect(shareKeyParam(TOKEN)).toBe(TOKEN);
    expect(shareKeyParam("")).toBe("");
    expect(shareKeyParam(123)).toBe("");
    expect(shareKeyParam(null)).toBe("");
    expect(shareKeyParam({ a: 1 })).toBe("");
  });

  test("shareNotice — текст полосы дословно", () => {
    expect(shareNotice("16.10.2026")).toBe(
      "Черновик для согласования. На сайте ещё не опубликован. Ссылка действует до 16.10.2026.",
    );
  });
});
