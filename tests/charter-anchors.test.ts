import { describe, expect, test } from "bun:test";
import { clauseAnchorId, listCharterClauses } from "@/lib/charter/anchors";
import { charterContent } from "@/lib/charter/content";

const clauses = listCharterClauses(charterContent);

describe("listCharterClauses", () => {
  test("ровно 63 нумерованных пункта, без дубликатов", () => {
    expect(clauses).toHaveLength(63);
    expect(new Set(clauses).size).toBe(63);
  });

  test("каждый номер — вида N.M", () => {
    for (const clause of clauses) {
      expect(clause).toMatch(/^\d{1,2}\.\d{1,2}$/);
    }
  });
});

describe("clauseAnchorId", () => {
  test("6.4 → p-6-4", () => {
    expect(clauseAnchorId("6.4")).toBe("p-6-4");
  });

  test("id всех пунктов уникальны и вида p-N-M", () => {
    const ids = clauses.map(clauseAnchorId);
    expect(new Set(ids).size).toBe(clauses.length);
    for (const id of ids) {
      expect(id).toMatch(/^p-\d{1,2}-\d{1,2}$/);
    }
  });
});
