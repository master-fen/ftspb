import { describe, expect, test } from "bun:test";
import { CHARTER_BODIES, STRUCTURE_NODES, structureLevel } from "@/lib/federation-structure";

const ids = STRUCTURE_NODES.map((node) => node.id);
const idSet = new Set<string>(ids);

describe("STRUCTURE_NODES", () => {
  test("ровно 12 узлов с уникальными id", () => {
    expect(STRUCTURE_NODES).toHaveLength(12);
    expect(idSet.size).toBe(12);
  });

  test("ровно один корень (parent === null)", () => {
    const roots = STRUCTURE_NODES.filter((node) => node.parent === null);
    expect(roots.map((node) => node.id)).toEqual(["assembly"]);
  });

  test("все parent ссылаются на существующие id", () => {
    for (const node of STRUCTURE_NODES) {
      if (node.parent !== null) {
        expect(idSet.has(node.parent)).toBe(true);
      }
    }
  });

  test("узлов kind position ровно 9", () => {
    expect(STRUCTURE_NODES.filter((node) => node.kind === "position")).toHaveLength(9);
  });

  test("уровни из цепочки parent: 1 / 2 / 3 / 6", () => {
    const counts: Record<number, number> = {};
    for (const id of ids) {
      const level = structureLevel(id);
      counts[level] = (counts[level] ?? 0) + 1;
    }
    expect(counts).toEqual({ 0: 1, 1: 2, 2: 3, 3: 6 });
  });
});

describe("CHARTER_BODIES", () => {
  test("6 записей", () => {
    expect(CHARTER_BODIES).toHaveLength(6);
  });
});
