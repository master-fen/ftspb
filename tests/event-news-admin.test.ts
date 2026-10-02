import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

describe("listAdminNewsForEvent — только для сессии админки", () => {
  // createServerFn вызывается по HTTP напрямую, guard роута не граница
  // безопасности (CLAUDE.md), а функция отдаёт и черновики. Выполнить её без
  // базы нельзя, поэтому проверяется исходник: первая инструкция тела —
  // requireSession.
  const source = fs.readFileSync(
    path.resolve(import.meta.dir, "../src/server/news-admin.ts"),
    "utf-8",
  );
  test("тело начинается с await requireSession()", () => {
    const match = /export async function listAdminNewsForEvent\([^)]*\)[^{]*\{\s*([^\n]*)/.exec(
      source,
    );
    expect(match?.[1]).toBe("await requireSession();");
  });
});
