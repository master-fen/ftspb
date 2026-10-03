/*
 * Сторож данных календаря турниров (src/data/tournaments.ts). Числа по месяцам —
 * из сверки первой загрузки; при обновлении календаря они меняются тем же PR,
 * что и данные, а изменения против прежней версии называются в докладе
 * (docs/calendar.md, «Порядок обновления»).
 */
import { describe, expect, test } from "bun:test";
import {
  TOURNAMENT_AGES,
  TOURNAMENT_SOURCES,
  TOURNAMENTS,
  type TournamentSourceKey,
} from "@/data/tournaments";

/** Номер дня от 0000-03-01 по григорианскому календарю — разность дат без Date. */
function dayNumber(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match === null) throw new Error(`не дата: ${isoDate}`);
  const month = Number(match[2]);
  const year = Number(match[1]) - (month <= 2 ? 1 : 0);
  const shifted = (month + 9) % 12;
  return (
    year * 365 +
    Math.floor(year / 4) -
    Math.floor(year / 100) +
    Math.floor(year / 400) +
    Math.floor((153 * shifted + 2) / 5) +
    Number(match[3]) -
    1
  );
}

/** Запись с двумя источниками считается в каждом из них. */
function countByMonth(source: TournamentSourceKey): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of TOURNAMENTS) {
    if (!t.sources.includes(source)) continue;
    const month = t.start.slice(0, 7);
    counts[month] = (counts[month] ?? 0) + 1;
  }
  return counts;
}

describe("число записей по источнику и месяцу даты начала", () => {
  test("spb-2026: 2026-09 — 3, 10 — 5, 11 — 9, 12 — 6", () => {
    expect(countByMonth("spb-2026")).toEqual({
      "2026-09": 3,
      "2026-10": 5,
      "2026-11": 9,
      "2026-12": 6,
    });
  });

  test("ftr-2026: 4, 9, 6, 12, 14, 14, 16, 17, 9, 6, 10, 1", () => {
    expect(countByMonth("ftr-2026")).toEqual({
      "2026-01": 4,
      "2026-02": 9,
      "2026-03": 6,
      "2026-04": 12,
      "2026-05": 14,
      "2026-06": 14,
      "2026-07": 16,
      "2026-08": 17,
      "2026-09": 9,
      "2026-10": 6,
      "2026-11": 10,
      "2026-12": 1,
    });
  });

  test("ftr-2027: 5, 7, 8, 8, 10, 8, 10, 13, 8, 6, 10, 2", () => {
    expect(countByMonth("ftr-2027")).toEqual({
      "2027-01": 5,
      "2027-02": 7,
      "2027-03": 8,
      "2027-04": 8,
      "2027-05": 10,
      "2027-06": 8,
      "2027-07": 10,
      "2027-08": 13,
      "2027-09": 8,
      "2027-10": 6,
      "2027-11": 10,
      "2027-12": 2,
    });
  });
});

describe("записи", () => {
  test("уникальных записей 235, в двух источниках сразу — одна", () => {
    // Ключ без источников: одно соревнование из двух календарей — одна запись.
    const keys = new Set(TOURNAMENTS.map(({ sources: _sources, ...rest }) => JSON.stringify(rest)));
    expect(TOURNAMENTS.length).toBe(235);
    expect(keys.size).toBe(235);
    expect(TOURNAMENTS.filter((t) => t.sources.length > 1).length).toBe(1);
  });

  test("начало ≤ конец, длина не больше 7 дней", () => {
    const bad = TOURNAMENTS.filter((t) => {
      const days = dayNumber(t.end) - dayNumber(t.start) + 1;
      return days < 1 || days > 7;
    });
    expect(bad).toEqual([]);
  });

  test("год даты начала равен году каждого источника записи", () => {
    const yearOf = new Map(TOURNAMENT_SOURCES.map((s) => [s.key, s.year]));
    const bad = TOURNAMENTS.filter((t) =>
      t.sources.some((key) => yearOf.get(key) !== Number(t.start.slice(0, 4))),
    );
    expect(bad).toEqual([]);
  });

  test("возрасты только из списка, без повторов", () => {
    const allowed = new Set<string>(TOURNAMENT_AGES);
    const bad = TOURNAMENTS.filter(
      (t) =>
        t.ages.length === 0 ||
        new Set(t.ages).size !== t.ages.length ||
        t.ages.some((age) => !allowed.has(age)),
    );
    expect(bad).toEqual([]);
  });

  test("у записей календаря spb-2026 есть база", () => {
    const bad = TOURNAMENTS.filter((t) => t.sources.includes("spb-2026") && !t.venue);
    expect(bad).toEqual([]);
  });

  test("каждый ключ источника существует", () => {
    const keys = new Set<string>(TOURNAMENT_SOURCES.map((s) => s.key));
    const bad = TOURNAMENTS.filter(
      (t) => t.sources.length === 0 || t.sources.some((k) => !keys.has(k)),
    );
    expect(bad).toEqual([]);
  });
});

describe("dayNumber — вспомогательная разность дат", () => {
  test("через границу месяца, года и високосного февраля", () => {
    expect(dayNumber("2026-10-04") - dayNumber("2026-09-28")).toBe(6);
    expect(dayNumber("2027-01-03") - dayNumber("2026-12-28")).toBe(6);
    expect(dayNumber("2028-03-01") - dayNumber("2028-02-28")).toBe(2);
    expect(dayNumber("2027-03-01") - dayNumber("2027-02-28")).toBe(1);
  });
});
