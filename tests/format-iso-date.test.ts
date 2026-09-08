import { describe, expect, test } from "bun:test";

import { formatIsoDateRu } from "@/lib/format-iso-date";

describe("formatIsoDateRu", () => {
  test("ISO-дата переводится в ДД.ММ.ГГГГ", () => {
    expect(formatIsoDateRu("2016-03-17")).toBe("17.03.2016");
  });

  test("не-ISO вход возвращается как есть", () => {
    expect(formatIsoDateRu("17 марта 2016 года")).toBe("17 марта 2016 года");
  });
});
