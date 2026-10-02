import { describe, expect, test } from "bun:test";
import {
  decideShareAccess,
  isShareLinkLive,
  newShareToken,
  sameShareKey,
  shareExpiresAt,
  shareLinkDate,
  shareLinkState,
  type ShareLinkRow,
} from "@/server/news-share-link";

const KEY = "Jk3s0vYb2Q9xXlq7pZr1mWc4tUe8aHn6dGf5yBo-_Ai";
const OTHER_KEY = "Q2w9eR4tY7uI1oP6aS3dF8gH5jK0lZxCvBnM-_qWert";
// 16.10.2026 10:00 по Москве.
const EXPIRES = new Date("2026-10-16T07:00:00Z");
const BEFORE = new Date("2026-10-10T09:00:00Z");

function row(overrides: Partial<ShareLinkRow> = {}): ShareLinkRow {
  return {
    status: "draft",
    deletedAt: null,
    previewToken: KEY,
    previewTokenExpiresAt: EXPIRES,
    ...overrides,
  };
}

describe("newShareToken", () => {
  test("43 знака base64url, два вызова различны", () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});

describe("срок — по московскую дату включительно", () => {
  test("shareExpiresAt — ровно 14 суток", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(shareExpiresAt(now).toISOString()).toBe("2026-10-16T12:00:00.000Z");
  });

  test("в день срока до полуночи по Москве — годна, хотя момент срока прошёл", () => {
    expect(isShareLinkLive(EXPIRES, new Date("2026-10-16T20:59:59Z"))).toBe(true);
  });

  test("с полуночи следующих суток по Москве — не годна", () => {
    expect(isShareLinkLive(EXPIRES, new Date("2026-10-16T21:00:00Z"))).toBe(false);
  });

  test("shareLinkDate: 21:30 UTC — в Москве уже следующие сутки", () => {
    expect(shareLinkDate(new Date("2026-10-15T21:30:00Z"))).toBe("16.10.2026");
    expect(shareLinkDate(new Date("2026-10-15T20:59:00Z"))).toBe("15.10.2026");
  });
});

describe("sameShareKey", () => {
  test("тот же ключ — да; другой, другой длины, пустой — нет, без исключения", () => {
    expect(sameShareKey(KEY, KEY)).toBe(true);
    expect(sameShareKey(OTHER_KEY, KEY)).toBe(false);
    expect(sameShareKey("abc", KEY)).toBe(false);
    expect(sameShareKey("", KEY)).toBe(false);
  });
});

describe("decideShareAccess", () => {
  test("черновик, верный ключ, срок не истёк — shared с датой", () => {
    expect(decideShareAccess(row(), KEY, BEFORE)).toEqual({
      kind: "shared",
      expiresOn: "16.10.2026",
    });
  });

  test("опубликованная, верный ключ — redirect", () => {
    expect(decideShareAccess(row({ status: "published" }), KEY, BEFORE)).toEqual({
      kind: "redirect",
    });
  });

  test("нет новости — invalid", () => {
    expect(decideShareAccess(null, KEY, BEFORE)).toEqual({ kind: "invalid" });
  });

  test("удалена — invalid", () => {
    expect(decideShareAccess(row({ deletedAt: BEFORE }), KEY, BEFORE)).toEqual({
      kind: "invalid",
    });
  });

  test("ссылка отозвана (токена и срока нет) — invalid", () => {
    const revoked = row({ previewToken: null, previewTokenExpiresAt: null });
    expect(decideShareAccess(revoked, KEY, BEFORE)).toEqual({ kind: "invalid" });
  });

  test("срок истёк — invalid", () => {
    expect(decideShareAccess(row(), KEY, new Date("2026-10-17T09:00:00Z"))).toEqual({
      kind: "invalid",
    });
  });

  test("неверный ключ — invalid", () => {
    expect(decideShareAccess(row(), "abc", BEFORE)).toEqual({ kind: "invalid" });
  });

  test("ключ другой новости — invalid", () => {
    expect(decideShareAccess(row({ previewToken: OTHER_KEY }), KEY, BEFORE)).toEqual({
      kind: "invalid",
    });
  });

  test("пустой ключ — invalid", () => {
    expect(decideShareAccess(row(), "", BEFORE)).toEqual({ kind: "invalid" });
  });

  test("опубликованная с истёкшим сроком — invalid, не redirect", () => {
    const late = new Date("2026-10-17T09:00:00Z");
    expect(decideShareAccess(row({ status: "published" }), KEY, late)).toEqual({
      kind: "invalid",
    });
  });

  test("удалённая опубликованная с верным ключом — invalid, не redirect", () => {
    const deleted = row({ status: "published", deletedAt: BEFORE });
    expect(decideShareAccess(deleted, KEY, BEFORE)).toEqual({ kind: "invalid" });
  });
});

describe("shareLinkState — для редактора", () => {
  test("нет токена — none", () => {
    expect(shareLinkState(null, null, BEFORE)).toEqual({ kind: "none" });
  });

  test("срок истёк — expired, без токена в ответе", () => {
    expect(shareLinkState(KEY, EXPIRES, new Date("2026-10-17T09:00:00Z"))).toEqual({
      kind: "expired",
    });
  });

  test("действует — active с токеном и датой", () => {
    expect(shareLinkState(KEY, EXPIRES, BEFORE)).toEqual({
      kind: "active",
      token: KEY,
      expiresOn: "16.10.2026",
    });
  });
});
