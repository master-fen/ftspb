import { describe, expect, test } from "bun:test";
import { pickRelatedNews } from "@/lib/news-related";
import type { NewsItem, NewsSection } from "@/lib/types/news";

function item(id: string, date: string, section: NewsSection | null | undefined): NewsItem {
  const base: NewsItem = { id, category: "Общее", date, title: id };
  return section === undefined ? base : { ...base, section };
}

// Даты dd.mm.yy; порядок объявления намеренно не хронологический.
const fed1 = item("fed-old", "01.01.25", "federation");
const fed2 = item("fed-mid", "01.06.25", "federation");
const fed3 = item("fed-new", "01.01.26", "federation");
const fed4 = item("fed-newest", "01.03.26", "federation");
const gen1 = item("gen-old", "01.02.25", null);
const gen2 = item("gen-new", "01.02.26", null);
const ref1 = item("ref", "01.04.26", "referees");

describe("pickRelatedNews", () => {
  test("исключает текущую новость", () => {
    const out = pickRelatedNews([fed1, fed2, fed3, gen1], fed2);
    expect(out.map((n) => n.id)).not.toContain("fed-mid");
  });

  test("своего раздела больше limit — только своё, новые сверху, без добивки", () => {
    const out = pickRelatedNews(
      [gen2, fed1, fed2, fed3, fed4, ref1],
      item("cur", "01.01.20", "federation"),
    );
    expect(out.map((n) => n.id)).toEqual(["fed-newest", "fed-new", "fed-mid"]);
  });

  test("своего раздела ноль — три самых свежих из остальных разделов", () => {
    // Текущая — «Общее» (null), а в списке только federation/referees.
    const out = pickRelatedNews([fed1, fed3, ref1, fed2], item("cur", "01.01.20", null));
    expect(out.map((n) => n.id)).toEqual(["ref", "fed-new", "fed-mid"]);
  });

  test("своего меньше limit — склейка: сначала своё по дате, потом добивка по дате, без общей пересортировки", () => {
    // Своё: fed1 (01.01.25) — старее любой добивки. При общей сортировке
    // он ушёл бы вниз; при склейке остаётся первым.
    const out = pickRelatedNews([gen2, ref1, fed1, gen1], item("cur", "01.01.20", "federation"));
    expect(out.map((n) => n.id)).toEqual(["fed-old", "ref", "gen-new"]);
  });

  test("section undefined у мок-фикстур считается как null («Общее»)", () => {
    const mockGen = item("mock-gen", "01.05.26", undefined);
    const out = pickRelatedNews([fed1, mockGen, gen1], item("cur", "01.01.20", null));
    expect(out.map((n) => n.id)).toEqual(["mock-gen", "gen-old", "fed-old"]);
  });

  test("результат не длиннее limit и без повторов", () => {
    const all = [fed1, fed2, fed3, fed4, gen1, gen2, ref1];
    const out = pickRelatedNews(all, item("cur", "01.01.20", null), 3);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((n) => n.id)).size).toBe(3);
  });

  test("кандидатов меньше limit — отдаёт сколько есть", () => {
    expect(pickRelatedNews([fed1], item("cur", "01.01.20", null))).toHaveLength(1);
    expect(pickRelatedNews([], item("cur", "01.01.20", null))).toEqual([]);
  });
});
