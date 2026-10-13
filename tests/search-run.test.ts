import { describe, expect, test } from "bun:test";
import { buildFieldWithPositions, createInternPool } from "@/lib/search-field-index";
import { emptySearchResponse } from "@/lib/search-response";
import { runSearch, runSearchOverIndex, type SearchInput } from "@/server/search";
import type { SearchIndex } from "@/server/search-index";
import type { NewsIndexItem } from "@/server/search-index-news";
import type { DocumentIndexItem } from "@/server/search-index-documents";
import type { EventIndexItem } from "@/server/search-index-events";
import type { SectionIndexItem } from "@/server/search-index-sections";

const intern = createInternPool();

function news(overrides: Partial<NewsIndexItem> & { id: string }): NewsIndexItem {
  return {
    href: `/news/${overrides.id}`,
    section: null,
    publishedAt: "2020-01-01",
    createdAt: "2020-01-01T00:00:00.000Z",
    title: buildFieldWithPositions("", intern),
    excerpt: buildFieldWithPositions("", intern),
    bodyPresence: { exactSet: new Set(), stemSet: new Set() },
    bodyText: "",
    ...overrides,
  };
}

function withText(title: string, excerpt = "", body = "") {
  return {
    title: buildFieldWithPositions(title, intern),
    excerpt: buildFieldWithPositions(excerpt, intern),
    bodyPresence: buildFieldWithPositions(body, intern),
    bodyText: body,
  };
}

function document(overrides: Partial<DocumentIndexItem> & { id: string }): DocumentIndexItem {
  return {
    href: `/documents/${overrides.id}`,
    fileName: "file.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
    documentDate: "2020-01-01",
    createdAt: "2020-01-01T00:00:00.000Z",
    title: buildFieldWithPositions("", intern),
    parent: null,
    ...overrides,
  };
}

function event(overrides: Partial<EventIndexItem> & { id: string }): EventIndexItem {
  return {
    href: `/federation/events/${overrides.id}`,
    startsOn: "2020-01-01",
    datePrecision: "day",
    createdAt: "2020-01-01T00:00:00.000Z",
    title: buildFieldWithPositions("", intern),
    location: buildFieldWithPositions("", intern),
    description: buildFieldWithPositions("", intern),
    ...overrides,
  };
}

function section(
  overrides: Partial<SectionIndexItem> & { id: string; order: number },
): SectionIndexItem {
  return {
    href: `/${overrides.id}`,
    breadcrumb: [],
    title: buildFieldWithPositions("", intern),
    text: buildFieldWithPositions("", intern),
    ...overrides,
  };
}

const EMPTY_INDEX: SearchIndex = { news: [], documents: [], events: [], sections: [] };

function baseInput(overrides: Partial<SearchInput> = {}): SearchInput {
  return { q: "турнир", tab: "all", year: "all", sort: "relevance", page: 1, ...overrides };
}

describe("runSearchOverIndex — «уточните запрос»", () => {
  test("пустой значимыми словами запрос не трогает индекс", () => {
    const result = runSearchOverIndex(baseInput({ q: "в на по" }), EMPTY_INDEX);
    expect(result.tooVague).toBe(true);
    expect(result.news).toBeNull();
  });

  test("значимый, но нигде не найденный запрос — «ничего не нашлось», не «неполное совпадение» (регрессия)", () => {
    const index: SearchIndex = {
      ...EMPTY_INDEX,
      news: [news({ id: "a", ...withText("совсем другой текст") })],
    };
    const result = runSearchOverIndex(baseInput({ q: "ывапролд", tab: "news" }), index);
    expect(result.tooVague).toBe(false);
    expect(result.partialMatch).toBe(false);
    expect(result.news).toEqual([]);
    expect(result.totalForTab).toBe(0);
  });
});

describe("runSearch — пустой и «уточните запрос» не загружают индекс", () => {
  // Пустой /search (мобильная лупа) ждал полную сборку индекса — после деплоя
  // и после каждой правки в админке около 2,4 с — хотя индекс ему не нужен.
  function countingLoad() {
    let calls = 0;
    return {
      load: async () => {
        calls += 1;
        return EMPTY_INDEX;
      },
      calls: () => calls,
    };
  }

  for (const q of ["", "   ", "в на по", "я"]) {
    test(`q=${JSON.stringify(q)}: 0 загрузок индекса, ответ «уточните запрос»`, async () => {
      const counter = countingLoad();
      const result = await runSearch(baseInput({ q }), counter.load);
      expect({ загрузок: counter.calls(), tooVague: result.tooVague, query: result.query }).toEqual(
        { загрузок: 0, tooVague: true, query: q },
      );
      expect(result).toEqual(runSearchOverIndex(baseInput({ q }), EMPTY_INDEX));
    });
  }

  for (const q of ["", "   "]) {
    test(`q=${JSON.stringify(q)}: ответ loader маршрута /search без сервера совпадает с runSearch`, async () => {
      const counter = countingLoad();
      const server = await runSearch(
        baseInput({ q, tab: "news", sort: "date", year: 2020 }),
        counter.load,
      );
      expect(
        emptySearchResponse(q, baseInput({ q, tab: "news", sort: "date", year: 2020 }), true),
      ).toEqual(server);
    });
  }

  test("значимый запрос загружает индекс ровно один раз", async () => {
    const counter = countingLoad();
    const result = await runSearch(baseInput({ q: "турнир" }), counter.load);
    expect({ загрузок: counter.calls(), tooVague: result.tooVague }).toEqual({
      загрузок: 1,
      tooVague: false,
    });
  });
});

describe("runSearchOverIndex — числа по вкладкам не зависят от года", () => {
  const index: SearchIndex = {
    ...EMPTY_INDEX,
    news: [
      news({ id: "a", publishedAt: "2020-01-01", ...withText("турнир 2020") }),
      news({ id: "b", publishedAt: "2021-01-01", ...withText("турнир 2021") }),
    ],
  };

  test("counts.news считает все года разом", () => {
    const all = runSearchOverIndex(baseInput({ tab: "news", year: "all" }), index);
    expect(all.counts.news).toBe(2);
    const filtered = runSearchOverIndex(baseInput({ tab: "news", year: 2020 }), index);
    expect(filtered.counts.news).toBe(2); // число по вкладке не меняется
    expect(filtered.totalForTab).toBe(1); // «Найдено N» — с учётом года
  });

  test("список годов — по убыванию", () => {
    const result = runSearchOverIndex(baseInput({ tab: "news" }), index);
    expect(result.years).toEqual([2021, 2020]);
  });
});

describe("runSearchOverIndex — режим «все слова» один на весь запрос", () => {
  test("новость с обоими словами переводит весь запрос в режим «все слова» — документ без одного слова не показан", () => {
    const index: SearchIndex = {
      news: [news({ id: "a", ...withText("городской турнир") })],
      documents: [document({ id: "d1", title: buildFieldWithPositions("городской", intern) })],
      events: [],
      sections: [],
    };
    const result = runSearchOverIndex(
      baseInput({ q: "городской турнир", tab: "documents" }),
      index,
    );
    expect(result.partialMatch).toBe(false); // у новости есть оба слова — режим "full" для всех типов разом
    expect(result.documents).toHaveLength(0); // у документа нет «турнир» — не проходит режим "full"
  });

  test("если ни у кого нет всех слов — все типы в режиме partial", () => {
    const index: SearchIndex = {
      news: [news({ id: "a", ...withText("городской") })],
      documents: [document({ id: "d1", title: buildFieldWithPositions("турнир", intern) })],
      events: [],
      sections: [],
    };
    const result = runSearchOverIndex(baseInput({ q: "городской турнир", tab: "news" }), index);
    expect(result.partialMatch).toBe(true);
    expect(result.news).toHaveLength(1);
  });
});

describe("runSearchOverIndex — пагинация и тизеры", () => {
  test("вкладка «Всё», страница 1 — тизеры документов/событий/разделов заполнены", () => {
    const index: SearchIndex = {
      news: [news({ id: "a", ...withText("турнир") })],
      documents: [document({ id: "d1", title: buildFieldWithPositions("турнир", intern) })],
      events: [event({ id: "e1", title: buildFieldWithPositions("турнир", intern) })],
      sections: [section({ id: "s1", order: 0, title: buildFieldWithPositions("турнир", intern) })],
    };
    const result = runSearchOverIndex(baseInput({ tab: "all", page: 1 }), index);
    expect(result.documentsTeaser).toHaveLength(1);
    expect(result.eventsTeaser).toHaveLength(1);
    expect(result.sectionsTeaser).toHaveLength(1);
    expect(result.news).toHaveLength(1);
  });

  test("вкладка «Всё», страница 2 — только новости, тизеров нет", () => {
    const manyNews = Array.from({ length: 25 }, (_, i) =>
      news({
        id: `n${i}`,
        publishedAt: `2020-01-${String((i % 28) + 1).padStart(2, "0")}`,
        ...withText("турнир"),
      }),
    );
    const index: SearchIndex = {
      news: manyNews,
      documents: [document({ id: "d1", title: buildFieldWithPositions("турнир", intern) })],
      events: [],
      sections: [],
    };
    const result = runSearchOverIndex(baseInput({ tab: "all", page: 2 }), index);
    expect(result.documentsTeaser).toBeNull();
    expect(result.news!.length).toBeGreaterThan(0);
  });

  test("вкладка documents пагинирует независимо от новостей", () => {
    const manyDocs = Array.from({ length: 25 }, (_, i) =>
      document({ id: `d${i}`, title: buildFieldWithPositions("турнир", intern) }),
    );
    const index: SearchIndex = { news: [], documents: manyDocs, events: [], sections: [] };
    const page1 = runSearchOverIndex(baseInput({ tab: "documents", page: 1 }), index);
    expect(page1.documents).toHaveLength(20);
    expect(page1.pageCount).toBe(2);
    const page2 = runSearchOverIndex(baseInput({ tab: "documents", page: 2 }), index);
    expect(page2.documents).toHaveLength(5);
  });
});

describe("runSearchOverIndex — сортировка новостей", () => {
  test("«Сначала новые» не меняет состав, только порядок", () => {
    const index: SearchIndex = {
      ...EMPTY_INDEX,
      news: [
        news({ id: "old", publishedAt: "2019-01-01", ...withText("турнир") }),
        news({ id: "new", publishedAt: "2024-01-01", ...withText("турнир") }),
      ],
    };
    const relevance = runSearchOverIndex(baseInput({ tab: "news", sort: "relevance" }), index);
    const byDate = runSearchOverIndex(baseInput({ tab: "news", sort: "date" }), index);
    expect(relevance.news!.map((r) => r.id).sort()).toEqual(byDate.news!.map((r) => r.id).sort());
    expect(byDate.news![0].id).toBe("new"); // новее — первая при «Сначала новые»
  });
});

describe("runSearchOverIndex — документ вне общего списка", () => {
  test("строка с родителем несёт его название/дату/ссылку", () => {
    const index: SearchIndex = {
      ...EMPTY_INDEX,
      documents: [
        document({
          id: "d1",
          title: buildFieldWithPositions("турнир", intern),
          parent: {
            kind: "news",
            title: "Итоги турнира",
            dateIso: "2020-05-01",
            href: "/news/itogi",
          },
        }),
      ],
    };
    const result = runSearchOverIndex(baseInput({ tab: "documents" }), index);
    expect(result.documents![0].parent).toEqual({
      kind: "news",
      title: "Итоги турнира",
      dateFormatted: "01.05.2020",
      href: "/news/itogi",
    });
  });
});

describe("runSearchOverIndex — событие: место без подсветки", () => {
  test("location передаётся обычной строкой", () => {
    const index: SearchIndex = {
      ...EMPTY_INDEX,
      events: [
        event({
          id: "e1",
          title: buildFieldWithPositions("турнир", intern),
          location: buildFieldWithPositions("Дворец спорта", intern),
        }),
      ],
    };
    const result = runSearchOverIndex(baseInput({ tab: "events" }), index);
    expect(result.events![0].location).toBe("Дворец спорта");
  });
});
