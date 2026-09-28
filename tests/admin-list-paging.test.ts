import { describe, expect, test } from "bun:test";
import {
  ADMIN_PAGE_SIZE,
  MIN_ARCHIVE_YEAR,
  clampPageToLast,
  parseDeletedParam,
  parseSectionParam,
  parseSourceParam,
  parseStatusParam,
  parseTextParam,
  parseYearParam,
} from "@/lib/admin-list-paging";

describe("ADMIN_PAGE_SIZE", () => {
  test("50 строк на страницу", () => {
    expect(ADMIN_PAGE_SIZE).toBe(50);
  });
});

describe("clampPageToLast", () => {
  test("меньше диапазона — без изменений", () => {
    expect(clampPageToLast(1, 3)).toBe(1);
    expect(clampPageToLast(2, 3)).toBe(2);
  });

  test("больше диапазона — последняя страница", () => {
    expect(clampPageToLast(99, 3)).toBe(3);
  });

  test("ноль страниц — 1", () => {
    expect(clampPageToLast(1, 0)).toBe(1);
    expect(clampPageToLast(5, 0)).toBe(1);
  });

  test("нецелое/отрицательное/ноль — 1", () => {
    expect(clampPageToLast(1.5, 3)).toBe(1);
    expect(clampPageToLast(-1, 3)).toBe(1);
    expect(clampPageToLast(0, 3)).toBe(1);
    expect(clampPageToLast(NaN, 3)).toBe(1);
  });
});

describe("parseYearParam", () => {
  test("валидный год в пределах — проходит", () => {
    expect(parseYearParam(2023)).toBe(2023);
    expect(parseYearParam("2023")).toBe(2023);
  });

  test(`нижняя граница ${MIN_ARCHIVE_YEAR}`, () => {
    expect(parseYearParam(MIN_ARCHIVE_YEAR)).toBe(MIN_ARCHIVE_YEAR);
    expect(parseYearParam(MIN_ARCHIVE_YEAR - 1)).toBe("all");
  });

  test("верхняя граница — текущий год + 1", () => {
    const maxYear = new Date().getFullYear() + 1;
    expect(parseYearParam(maxYear)).toBe(maxYear);
    expect(parseYearParam(maxYear + 1)).toBe("all");
  });

  test("мусор → «все годы»", () => {
    expect(parseYearParam(undefined)).toBe("all");
    expect(parseYearParam("all")).toBe("all");
    expect(parseYearParam("abc")).toBe("all");
    expect(parseYearParam(2023.5)).toBe("all");
    expect(parseYearParam(-3)).toBe("all");
  });
});

describe("parseSectionParam", () => {
  test("известные значения проходят", () => {
    expect(parseSectionParam("none")).toBe("none");
    expect(parseSectionParam("federation")).toBe("federation");
    expect(parseSectionParam("referees")).toBe("referees");
  });

  test("мусор и неизвестное значение → all", () => {
    expect(parseSectionParam(undefined)).toBe("all");
    expect(parseSectionParam("что-то")).toBe("all");
    expect(parseSectionParam(42)).toBe("all");
  });
});

describe("parseStatusParam", () => {
  test("известные значения проходят", () => {
    expect(parseStatusParam("draft")).toBe("draft");
    expect(parseStatusParam("published")).toBe("published");
  });

  test("мусор → all", () => {
    expect(parseStatusParam(undefined)).toBe("all");
    expect(parseStatusParam("archived")).toBe("all");
  });
});

describe("parseSourceParam", () => {
  test("известные значения проходят", () => {
    expect(parseSourceParam("archive")).toBe("archive");
    expect(parseSourceParam("manual")).toBe("manual");
  });

  test("мусор → all", () => {
    expect(parseSourceParam(undefined)).toBe("all");
    expect(parseSourceParam("legacy")).toBe("all");
  });
});

describe("parseDeletedParam", () => {
  test("true и «1» → true", () => {
    expect(parseDeletedParam(true)).toBe(true);
    expect(parseDeletedParam("1")).toBe(true);
  });

  test("всё остальное → false", () => {
    expect(parseDeletedParam(false)).toBe(false);
    expect(parseDeletedParam("0")).toBe(false);
    expect(parseDeletedParam("true")).toBe(false);
    expect(parseDeletedParam(undefined)).toBe(false);
    expect(parseDeletedParam(1)).toBe(false);
  });
});

describe("parseTextParam", () => {
  test("обрезка пробелов по краям", () => {
    expect(parseTextParam("  турнир  ")).toBe("турнир");
  });

  test("не-строка → пустая строка", () => {
    expect(parseTextParam(undefined)).toBe("");
    expect(parseTextParam(null)).toBe("");
    expect(parseTextParam(42)).toBe("");
  });
});
