import { describe, expect, test } from "bun:test";
import {
  eventYear,
  formatEventDateLong,
  formatEventDateShort,
  isPast,
  normalizeAnchor,
  periodEnd,
  type DatePrecision,
} from "@/lib/event-date";

describe("normalizeAnchor", () => {
  test("day — дата не меняется", () => {
    expect(normalizeAnchor("2026-03-19", "day")).toBe("2026-03-19");
  });

  test("month — первое число", () => {
    expect(normalizeAnchor("2027-03-19", "month")).toBe("2027-03-01");
    expect(normalizeAnchor("2027-12-31", "month")).toBe("2027-12-01");
  });

  test.each([
    ["2026-01-01", "2026-01-01"],
    ["2026-03-31", "2026-01-01"],
    ["2026-04-01", "2026-04-01"],
    ["2026-06-30", "2026-04-01"],
    ["2026-07-01", "2026-07-01"],
    ["2026-09-30", "2026-07-01"],
    ["2026-10-01", "2026-10-01"],
    ["2026-12-31", "2026-10-01"],
  ])("quarter: %s → %s", (input, expected) => {
    expect(normalizeAnchor(input, "quarter")).toBe(expected);
  });

  test.each([
    ["2026-01-01", "2026-01-01"],
    ["2026-06-30", "2026-01-01"],
    ["2026-07-01", "2026-07-01"],
    ["2026-12-31", "2026-07-01"],
  ])("half_year: %s → %s", (input, expected) => {
    expect(normalizeAnchor(input, "half_year")).toBe(expected);
  });

  test("year — первое января", () => {
    expect(normalizeAnchor("2030-08-17", "year")).toBe("2030-01-01");
  });

  test("повторная нормализация ничего не меняет", () => {
    const precisions: DatePrecision[] = ["day", "month", "quarter", "half_year", "year"];
    for (const precision of precisions) {
      const once = normalizeAnchor("2026-08-17", precision);
      expect(normalizeAnchor(once, precision)).toBe(once);
    }
  });

  test("неверный формат — ошибка, а не молчаливый NaN", () => {
    expect(() => normalizeAnchor("19.03.2026", "day")).toThrow(/YYYY-MM-DD/);
  });
});

describe("periodEnd", () => {
  test("day — та же дата", () => {
    expect(periodEnd("2026-03-19", "day")).toBe("2026-03-19");
  });

  test("month — последний день, включая февраль", () => {
    expect(periodEnd("2026-03-19", "month")).toBe("2026-03-31");
    expect(periodEnd("2026-02-10", "month")).toBe("2026-02-28");
    expect(periodEnd("2028-02-10", "month")).toBe("2028-02-29");
    expect(periodEnd("2100-02-10", "month")).toBe("2100-02-28");
    expect(periodEnd("2000-02-10", "month")).toBe("2000-02-29");
  });

  test.each([
    ["2026-03-31", "2026-03-31"],
    ["2026-01-15", "2026-03-31"],
    ["2026-04-01", "2026-06-30"],
    ["2026-06-30", "2026-06-30"],
    ["2026-07-01", "2026-09-30"],
    ["2026-10-01", "2026-12-31"],
  ])("quarter: %s → %s", (input, expected) => {
    expect(periodEnd(input, "quarter")).toBe(expected);
  });

  test.each([
    ["2026-06-30", "2026-06-30"],
    ["2026-01-01", "2026-06-30"],
    ["2026-07-01", "2026-12-31"],
    ["2026-12-31", "2026-12-31"],
  ])("half_year: %s → %s", (input, expected) => {
    expect(periodEnd(input, "half_year")).toBe(expected);
  });

  test("year — 31 декабря", () => {
    expect(periodEnd("2030-05-05", "year")).toBe("2030-12-31");
  });
});

describe("isPast", () => {
  test("day: прошло только со следующего дня", () => {
    expect(isPast("2026-03-19", "day", "2026-03-19")).toBe(false);
    expect(isPast("2026-03-19", "day", "2026-03-20")).toBe(true);
    expect(isPast("2026-03-19", "day", "2026-03-18")).toBe(false);
  });

  test("month: весь март не считается прошедшим", () => {
    expect(isPast("2026-03-01", "month", "2026-03-31")).toBe(false);
    expect(isPast("2026-03-01", "month", "2026-04-01")).toBe(true);
  });

  test("quarter: III квартал не прошёл 15 августа", () => {
    expect(isPast("2026-07-01", "quarter", "2026-08-15")).toBe(false);
    expect(isPast("2026-07-01", "quarter", "2026-09-30")).toBe(false);
    expect(isPast("2026-07-01", "quarter", "2026-10-01")).toBe(true);
  });

  test("half_year: 1-е полугодие", () => {
    expect(isPast("2026-01-01", "half_year", "2026-06-30")).toBe(false);
    expect(isPast("2026-01-01", "half_year", "2026-07-01")).toBe(true);
  });

  test("year", () => {
    expect(isPast("2030-01-01", "year", "2030-12-31")).toBe(false);
    expect(isPast("2030-01-01", "year", "2031-01-01")).toBe(true);
  });
});

describe("formatEventDateLong", () => {
  test("day без времени и со временем", () => {
    expect(formatEventDateLong("2026-03-19", "day")).toBe("19 марта 2026");
    expect(formatEventDateLong("2026-03-19", "day", "18:00")).toBe("19 марта 2026, 18:00");
    expect(formatEventDateLong("2026-03-19", "day", "18:00:00")).toBe("19 марта 2026, 18:00");
    expect(formatEventDateLong("2026-03-19", "day", null)).toBe("19 марта 2026");
  });

  test("время игнорируется при точности не day", () => {
    expect(formatEventDateLong("2027-03-01", "month", "18:00")).toBe("март 2027");
  });

  test.each([
    ["2027-03-01", "month", "март 2027"],
    ["2026-07-01", "quarter", "III квартал 2026"],
    ["2026-01-01", "quarter", "I квартал 2026"],
    ["2026-10-01", "quarter", "IV квартал 2026"],
    ["2026-01-01", "half_year", "1-е полугодие 2026"],
    ["2026-07-01", "half_year", "2-е полугодие 2026"],
    ["2030-01-01", "year", "2030"],
  ] as [string, DatePrecision, string][])("%s / %s → %s", (startsOn, precision, expected) => {
    expect(formatEventDateLong(startsOn, precision)).toBe(expected);
  });
});

describe("formatEventDateShort", () => {
  test.each([
    ["2026-03-19", "day", "19 мар"],
    ["2026-05-19", "day", "19 мая"],
    ["2027-03-01", "month", "март"],
    ["2026-07-01", "quarter", "III кв."],
    ["2026-04-01", "quarter", "II кв."],
    ["2026-01-01", "half_year", "1-е пол."],
    ["2026-07-01", "half_year", "2-е пол."],
    ["2030-01-01", "year", "2030"],
  ] as [string, DatePrecision, string][])("%s / %s → %s", (startsOn, precision, expected) => {
    expect(formatEventDateShort(startsOn, precision)).toBe(expected);
  });
});

describe("eventYear", () => {
  test("год якоря", () => {
    expect(eventYear("2026-03-19")).toBe(2026);
  });
});
