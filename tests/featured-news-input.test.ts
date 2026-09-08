import { describe, expect, test } from "bun:test";
import { featuredNewsInput, featuredSignature } from "@/lib/featured-news-input";

const ids = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
describe("featured selection", () => {
  test("allows clearing or selecting up to three; rejects duplicates and invalid IDs", () => {
    for (const count of [0, 1, 2, 3])
      expect(
        featuredNewsInput.safeParse({ ids: ids.slice(0, count), expected: "[]" }).success,
      ).toBe(true);
    for (const selected of [ids, [ids[0], ids[0]], ["not-a-uuid"]])
      expect(featuredNewsInput.safeParse({ ids: selected, expected: "[]" }).success).toBe(false);
  });
  test("stale-selection token ignores SQL row order, but detects reordered and removed cards", () => {
    const rows = [
      { id: ids[0], featuredOrder: 0 },
      { id: ids[1], featuredOrder: 1 },
    ];
    const signature = featuredSignature(rows);
    expect(featuredSignature([...rows].reverse())).toBe(signature);
    expect(
      featuredSignature(rows.map((r) => ({ ...r, featuredOrder: 1 - r.featuredOrder }))),
    ).not.toBe(signature);
    expect(featuredSignature(rows.slice(0, 1))).not.toBe(signature);
    expect(featuredSignature([{ id: ids[0], featuredOrder: null }, rows[1]])).not.toBe(signature);
  });
});
