import { describe, expect, test } from "bun:test";

import { normalizeDocumentSlug } from "@/lib/document-slug";

describe("normalizeDocumentSlug", () => {
  test("принимает корректные адреса", () => {
    expect(normalizeDocumentSlug("charter")).toEqual({ ok: true, slug: "charter" });
    expect(normalizeDocumentSlug("ustav-2016")).toEqual({ ok: true, slug: "ustav-2016" });
  });

  test("пустой ввод означает «без адреса»", () => {
    expect(normalizeDocumentSlug("")).toEqual({ ok: true, slug: null });
    expect(normalizeDocumentSlug("   ")).toEqual({ ok: true, slug: null });
    expect(normalizeDocumentSlug(null)).toEqual({ ok: true, slug: null });
    expect(normalizeDocumentSlug(undefined)).toEqual({ ok: true, slug: null });
  });

  test("отклоняет некорректные адреса", () => {
    for (const input of ["Charter", "устав", "-a", "a--b", "a-", "a b"]) {
      expect(normalizeDocumentSlug(input).ok).toBe(false);
    }
  });

  test("отклоняет строку из 65 символов", () => {
    expect(normalizeDocumentSlug("a".repeat(65)).ok).toBe(false);
    expect(normalizeDocumentSlug("a".repeat(64))).toEqual({ ok: true, slug: "a".repeat(64) });
  });
});
