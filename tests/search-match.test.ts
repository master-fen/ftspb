import { describe, expect, test } from "bun:test";
import { buildFieldPresence, tokenizeWithStems } from "@/lib/search-field-index";
import {
  compareDateTriplet,
  compareRelevance,
  decideMatchMode,
  FIELD_WEIGHT,
  matchTermInField,
  recencyBonus,
  scoreRecordText,
  selectByMatchMode,
} from "@/lib/search-match";
import { parseSearchQuery } from "@/lib/search-query";

function field(text: string) {
  return buildFieldPresence(tokenizeWithStems(text));
}

function firstTerm(query: string) {
  return parseSearchQuery(query).terms[0];
}

describe("matchTermInField — уровень «начало основы»", () => {
  test("антидопинг ↔ антидопинговые — совпадение", () => {
    const term = firstTerm("антидопинг");
    expect(matchTermInField(term, field("антидопинговые меры"))).toBe("prefix");
  });

  test("антидопинговые ↔ антидопинг — совпадение в обе стороны", () => {
    const term = firstTerm("антидопинговые");
    expect(matchTermInField(term, field("антидопинг"))).toBe("prefix");
  });

  test("федеральный не находит федерация", () => {
    const term = firstTerm("федеральный");
    expect(matchTermInField(term, field("федерация тенниса"))).toBeNull();
  });

  test("турнир не находит турникет", () => {
    const term = firstTerm("турнир");
    expect(matchTermInField(term, field("турникет на входе"))).toBeNull();
  });

  test("основа короче 5 знаков — без префиксного уровня", () => {
    // «дом» и «домик» — основы короче 5, не должны давать prefix
    const term = firstTerm("дом");
    const result = matchTermInField(term, field("домик у леса"));
    expect(result).not.toBe("prefix");
  });

  test("латиница — без префиксного уровня (точное совпадение только)", () => {
    const term = firstTerm("teni");
    expect(matchTermInField(term, field("tennis club"))).toBeNull();
  });

  test("цифры — без префиксного уровня", () => {
    const term = firstTerm("201");
    expect(matchTermInField(term, field("2019 год"))).toBeNull();
  });

  test("точная форма — exact", () => {
    const term = firstTerm("турнир");
    expect(matchTermInField(term, field("городской турнир"))).toBe("exact");
  });

  test("другая форма того же слова — stem", () => {
    const term = firstTerm("первенство");
    expect(matchTermInField(term, field("итоги первенства"))).toBe("stem");
  });
});

describe("matchTermInField — составной термин (whole ИЛИ все части)", () => {
  test("дефисный запрос находит слитную форму", () => {
    const term = firstTerm("Санкт-Петербург");
    expect(matchTermInField(term, field("выставка в Санкт-Петербурге"))).not.toBeNull();
  });

  test("дефисный запрос находит текст без дефиса, если есть все части", () => {
    const term = firstTerm("Санкт-Петербург");
    expect(matchTermInField(term, field("матч в Санкт Петербурге"))).not.toBeNull();
  });

  test("дефисный запрос не находит текст только с одной частью", () => {
    const term = firstTerm("вице-президент");
    expect(matchTermInField(term, field("выступил президент федерации"))).toBeNull();
  });

  test("2019 находит «2019г.»", () => {
    const term = firstTerm("2019");
    expect(matchTermInField(term, field("турнир 2019г. прошёл успешно"))).not.toBeNull();
  });
});

describe("scoreRecordText — вес полей", () => {
  test("совпадение в заголовке весит больше, чем в тексте", () => {
    const terms = parseSearchQuery("турнир").terms;
    const titleHit = scoreRecordText(
      terms,
      { title: field("турнир"), excerpt: field(""), body: field("") },
      FIELD_WEIGHT.news,
    );
    const bodyHit = scoreRecordText(
      terms,
      { title: field(""), excerpt: field(""), body: field("турнир") },
      FIELD_WEIGHT.news,
    );
    expect(titleHit.textScore).toBeGreaterThan(bodyHit.textScore);
  });

  test("exact и stem дают одинаковый вклад (один вес)", () => {
    const exactTerms = parseSearchQuery("первенство").terms;
    const stemTerms = parseSearchQuery("первенства").terms;
    const exactHit = scoreRecordText(
      exactTerms,
      { title: field("первенство"), excerpt: field(""), body: field("") },
      FIELD_WEIGHT.news,
    );
    const stemHit = scoreRecordText(
      stemTerms,
      { title: field("первенство"), excerpt: field(""), body: field("") },
      FIELD_WEIGHT.news,
    );
    expect(exactHit.textScore).toBe(stemHit.textScore);
  });
});

describe("recencyBonus — свойства свежести", () => {
  test("строго растёт с датой", () => {
    expect(recencyBonus("2020-06-01")).toBeGreaterThan(recencyBonus("2019-06-01"));
  });

  test("строго меньше 1 в разумном диапазоне дат", () => {
    expect(recencyBonus("2026-09-28")).toBeLessThan(1);
    expect(recencyBonus("2099-12-31")).toBeLessThan(1);
  });

  test("неотрицательна после точки отсчёта", () => {
    expect(recencyBonus("2000-01-01")).toBeGreaterThanOrEqual(0);
  });
});

describe("два свойства «Сначала подходящие» — алгебраически на фикстурах", () => {
  function newsScore(textScore: number, publishedAt: string) {
    return textScore + recencyBonus(publishedAt);
  }

  test("при равной текстовой оценке новее — выше", () => {
    const older = newsScore(100, "2020-01-01");
    const newer = newsScore(100, "2024-01-01");
    expect(newer).toBeGreaterThan(older);
  });

  test("старая новость со словом в заголовке выше свежей с тем же словом один раз в тексте", () => {
    const terms = parseSearchQuery("антидопинговые").terms; // намеренно не точная форма — худший случай, только prefix в заголовке
    const oldTitleHit = scoreRecordText(
      terms,
      { title: field("новости антидопинг"), excerpt: field(""), body: field("") },
      FIELD_WEIGHT.news,
    );
    const freshBodyHit = scoreRecordText(
      terms,
      { title: field(""), excerpt: field(""), body: field("текст про антидопинговые меры") },
      FIELD_WEIGHT.news,
    );
    const oldScore = newsScore(oldTitleHit.textScore, "2005-01-01");
    const freshScore = newsScore(freshBodyHit.textScore, "2026-09-28");
    expect(oldScore).toBeGreaterThan(freshScore);
  });
});

describe("selectByMatchMode / decideMatchMode — одно решение на весь запрос", () => {
  test("если хоть один кандидат (любого типа) содержит все термины — режим full для всех", () => {
    const mode = decideMatchMode([2, 1, 0], 2);
    expect(mode).toBe("full");
  });

  test("если ни один кандидат не содержит все термины — режим partial", () => {
    const mode = decideMatchMode([1, 1, 0], 2);
    expect(mode).toBe("partial");
  });

  test("full — отбирает только кандидатов со всеми терминами", () => {
    const candidates = [{ matchedCount: 2 }, { matchedCount: 1 }, { matchedCount: 0 }];
    expect(selectByMatchMode(candidates, "full", 2)).toEqual([{ matchedCount: 2 }]);
  });

  test("partial — отбирает всех с хотя бы одним термином", () => {
    const candidates = [{ matchedCount: 2 }, { matchedCount: 1 }, { matchedCount: 0 }];
    expect(selectByMatchMode(candidates, "partial", 2)).toEqual([
      { matchedCount: 2 },
      { matchedCount: 1 },
    ]);
  });
});

describe("compareRelevance / compareDateTriplet — детерминированный порядок", () => {
  test("matchedCount важнее score", () => {
    const items = [
      { matchedCount: 1, score: 1000 },
      { matchedCount: 2, score: 1 },
    ];
    const cmp = compareRelevance<{ matchedCount: number; score: number }>(() => 0);
    items.sort(cmp);
    expect(items[0].matchedCount).toBe(2);
  });

  test("при равном score и matchedCount — вторичный ключ по дате", () => {
    const a = { dateKey: "2020-01-01", createdAt: "2020-01-01T00:00:00Z", id: "a" };
    const b = { dateKey: "2021-01-01", createdAt: "2020-01-01T00:00:00Z", id: "b" };
    expect(compareDateTriplet(a, b)).toBeGreaterThan(0); // b новее — идёт раньше
  });

  test("порядок стабилен независимо от исходного порядка данных", () => {
    const a = { matchedCount: 1, score: 10, dateKey: "2020-01-01", createdAt: "c1", id: "1" };
    const b = { matchedCount: 1, score: 10, dateKey: "2021-01-01", createdAt: "c2", id: "2" };
    const cmp = compareRelevance<typeof a>((x, y) => compareDateTriplet(x, y));
    const order1 = [a, b].sort(cmp).map((x) => x.id);
    const order2 = [b, a].sort(cmp).map((x) => x.id);
    expect(order1).toEqual(order2);
  });
});
