import { describe, expect, test } from "bun:test";
import { tokenize, tokenizeRuns } from "@/lib/search-tokenize";

describe("tokenize", () => {
  test("простое слово — один токен без пары «целиком»", () => {
    const tokens = tokenize("турнир");
    expect(tokens).toEqual([{ surface: "турнир", start: 0, end: 6 }]);
  });

  test("цифры — токен без спецкейсов", () => {
    expect(tokenize("2019")).toEqual([{ surface: "2019", start: 0, end: 4 }]);
  });

  test("буквы+цифры слитно (U16, ITF) — целиком плюс части", () => {
    const tokens = tokenize("U16");
    const surfaces = tokens.map((t) => t.surface);
    expect(surfaces).toContain("U16");
    expect(surfaces).toContain("U");
    expect(surfaces).toContain("16");
  });

  test("дефис — целиком плюс части", () => {
    const tokens = tokenize("Санкт-Петербурга");
    const surfaces = tokens.map((t) => t.surface);
    expect(surfaces).toEqual(["Санкт-Петербурга", "Санкт", "Петербурга"]);
  });

  test("части дефисного токена имеют верные позиции", () => {
    const text = "финал Санкт-Петербурга турнир";
    const tokens = tokenize(text);
    const sankt = tokens.find((t) => t.surface === "Санкт")!;
    const peter = tokens.find((t) => t.surface === "Петербурга")!;
    expect(text.slice(sankt.start, sankt.end)).toBe("Санкт");
    expect(text.slice(peter.start, peter.end)).toBe("Петербурга");
  });

  test("2019г. — целиком «2019г» плюс части «2019» и «г»", () => {
    const tokens = tokenize("в 2019г. прошёл");
    const surfaces = tokens.map((t) => t.surface);
    expect(surfaces).toContain("2019г");
    expect(surfaces).toContain("2019");
    expect(surfaces).toContain("г");
  });

  test("несколько слов через пробел — независимые токены", () => {
    const tokens = tokenize("Санкт Петербург");
    expect(tokens.map((t) => t.surface)).toEqual(["Санкт", "Петербург"]);
  });

  test("пустая строка — пустой список", () => {
    expect(tokenize("")).toEqual([]);
  });

  test("пунктуация не входит в токены", () => {
    const tokens = tokenize("турнир, финал!");
    expect(tokens.map((t) => t.surface)).toEqual(["турнир", "финал"]);
  });
});

describe("tokenizeRuns", () => {
  test("простое слово — whole === единственная часть", () => {
    const runs = tokenizeRuns("турнир");
    expect(runs).toHaveLength(1);
    expect(runs[0].whole.surface).toBe("турнир");
    expect(runs[0].parts).toHaveLength(1);
  });

  test("составной прогон — whole отдельно от частей", () => {
    const runs = tokenizeRuns("вице-президент");
    expect(runs).toHaveLength(1);
    expect(runs[0].whole.surface).toBe("вице-президент");
    expect(runs[0].parts.map((p) => p.surface)).toEqual(["вице", "президент"]);
  });
});
