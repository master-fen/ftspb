import { describe, expect, test } from "bun:test";
import { PRODUCTION_HOSTS } from "@/lib/site";
import { isExcludedPath, isProductionHost, pageKey, shouldTrack } from "@/lib/analytics";

describe("isProductionHost — боевые адреса", () => {
  test("все четыре боевых адреса — да", () => {
    for (const host of [
      "spbtennisfed.ru",
      "www.spbtennisfed.ru",
      "tennisfed.spb.ru",
      "www.tennisfed.spb.ru",
    ]) {
      expect(isProductionHost(host)).toBe(true);
    }
  });

  test("список содержит ровно четыре адреса", () => {
    expect(PRODUCTION_HOSTS.length).toBe(4);
  });

  test("localhost, чужие и похожие адреса — нет", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "spbtennisfed.ru.example.com",
      "evil-spbtennisfed.ru",
      "",
    ]) {
      expect(isProductionHost(host)).toBe(false);
    }
  });
});

describe("isExcludedPath — админка", () => {
  test("/admin и всё под ним — исключены", () => {
    for (const path of ["/admin", "/admin/", "/admin/login", "/admin/news/1"]) {
      expect(isExcludedPath(path)).toBe(true);
    }
  });

  test("публичные пути и /administration — не исключены", () => {
    for (const path of ["/", "/news", "/administration", "/news/admin"]) {
      expect(isExcludedPath(path)).toBe(false);
    }
  });
});

describe("isExcludedPath — предпросмотр новости", () => {
  test("/news/preview/ID — исключён", () => {
    for (const path of [
      "/news/preview/0b3c5a52-6a4e-4f0e-9d7b-2f1d3c4e5a6b",
      "/news/preview/abc",
    ]) {
      expect(isExcludedPath(path)).toBe(true);
    }
  });

  test("/news/preview без хвоста и похожие пути — не исключены", () => {
    for (const path of ["/news/preview", "/news/preview/", "/news/previews/x", "/news/123"]) {
      expect(isExcludedPath(path)).toBe(false);
    }
  });
});

describe("shouldTrack — хост и путь вместе", () => {
  test("боевой хост, публичный путь — считаем", () => {
    expect(shouldTrack("spbtennisfed.ru", "/news")).toBe(true);
  });

  test("боевой хост, админка — нет", () => {
    expect(shouldTrack("spbtennisfed.ru", "/admin/login")).toBe(false);
  });

  test("localhost, публичный путь — нет", () => {
    expect(shouldTrack("localhost", "/news")).toBe(false);
  });
});

describe("pageKey — что считается сменой страницы", () => {
  test("pathname + search, без hash", () => {
    expect(pageKey("/news", "?category=athletes&page=2")).toBe("/news?category=athletes&page=2");
  });

  test("пустой search не добавляет «?»", () => {
    expect(pageKey("/news", "")).toBe("/news");
  });
});
