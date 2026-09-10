import { describe, expect, test } from "bun:test";
import { todayInMoscow } from "@/lib/today-msk";

describe("todayInMoscow", () => {
  test("21:30 UTC — в Москве уже следующие сутки", () => {
    expect(todayInMoscow(new Date("2026-03-19T21:30:00Z"))).toBe("2026-03-20");
  });

  test("20:59 UTC — в Москве ещё те же сутки", () => {
    expect(todayInMoscow(new Date("2026-03-19T20:59:00Z"))).toBe("2026-03-19");
  });

  test("полдень UTC — та же дата", () => {
    expect(todayInMoscow(new Date("2026-03-19T12:00:00Z"))).toBe("2026-03-19");
  });

  test("31 декабря 21:00 UTC — 1 января следующего года", () => {
    expect(todayInMoscow(new Date("2026-12-31T21:00:00Z"))).toBe("2027-01-01");
  });
});
