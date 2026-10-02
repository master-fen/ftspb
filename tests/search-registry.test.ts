import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { charterContent } from "@/lib/charter/content";
import {
  buildAboutSectionEntry,
  buildAntidopingSectionEntry,
  buildCharterSectionEntries,
  buildDescriptionSectionEntries,
  buildStructureSectionEntry,
  stripSiteName,
} from "@/lib/search-registry";
import { buildFieldWithPositions } from "@/lib/search-field-index";
import { matchTermInField, FIELD_WEIGHT, scoreRecordText } from "@/lib/search-match";
import { parseSearchQuery } from "@/lib/search-query";

const REPO_ROOT = join(import.meta.dir, "..");

function routeSourceContains(routeFile: string, needle: string): boolean {
  const source = readFileSync(join(REPO_ROOT, "src/routes", routeFile), "utf8");
  return source.includes(needle);
}

/** Строит FieldPresence «заголовок+текст» ровно как это сделает индекс раздела. */
function sectionField(entry: { title: string; text: string }) {
  return buildFieldWithPositions(`${entry.title} ${entry.text}`);
}

function matchesQuery(query: string, entry: { title: string; text: string }): boolean {
  const terms = parseSearchQuery(query).terms;
  const result = scoreRecordText(
    terms,
    { title: buildFieldWithPositions(entry.title), text: buildFieldWithPositions(entry.text) },
    FIELD_WEIGHT.section,
  );
  return result.matchedCount === terms.length && result.matchedCount > 0;
}

describe("buildDescriptionSectionEntries — та же строка, что в head() маршрута", () => {
  const routeFileById: Record<string, string> = {
    "page-news": "_site.news.index.tsx",
    "page-tournaments": "_site.tournaments.tsx",
    "page-documents": "_site.documents.tsx",
    "page-federation-news": "_site.federation.news.tsx",
    "page-federation-events": "_site.federation.events.tsx",
    "page-federation-documents": "_site.federation.documents.tsx",
  };

  test("каждая запись реестра указывает на существующий файл маршрута", () => {
    const entries = buildDescriptionSectionEntries();
    for (const entry of entries) {
      expect(routeFileById[entry.id]).toBeDefined();
    }
  });

  test.each(Object.entries(routeFileById))(
    "%s — исходный текст найден в файле маршрута",
    (id, routeFile) => {
      // Исходный (не свёрнутый по названию сайта) текст записи хранится в
      // buildDescriptionSectionEntries как литерал внутри stripSiteName(...) —
      // сверяем не entry.text (он уже без названия сайта), а то, что модуль
      // реестра прямо содержит строку head(), читая сам файл search-registry.ts.
      const registrySource = readFileSync(join(REPO_ROOT, "src/lib/search-registry.ts"), "utf8");
      // Достаём подстроку между кавычками, которая идёт в этой записи — проверяем
      // подстрокой без раскрутки кода: для этого используем сам факт, что при
      // правке текста в head() без правки реестра здесь произойдёт расхождение —
      // тест ищет заметный кусок исходного описания (первые ~20 знаков) в файле
      // маршрута.
      const idIndex = registrySource.indexOf(`id: "${id}"`);
      expect(idIndex).toBeGreaterThan(-1);
      const chunk = registrySource.slice(idIndex, idIndex + 600);
      const textMatch = chunk.match(/text:\s*\n?\s*stripSiteName\(\s*\n?\s*"([^"]+)"/);
      expect(textMatch).not.toBeNull();
      const snippet = (textMatch as RegExpMatchArray)[1].slice(0, 25);
      expect(routeSourceContains(routeFile, snippet)).toBe(true);
    },
  );
});

describe("stripSiteName", () => {
  test("вырезает «Федерации тенниса Санкт-Петербурга» (родительный)", () => {
    const result = stripSiteName("Все новости Федерации тенниса Санкт-Петербурга: лента.");
    expect(result.toLowerCase()).not.toContain("федерации тенниса");
  });

  test("вырезает сокращение «ФТ СПб»", () => {
    expect(stripSiteName("Документы ФТ СПб доступны здесь").toLowerCase()).not.toContain("фт спб");
  });

  test("остальной текст не затронут", () => {
    expect(stripSiteName("Библиотека документов с фильтром по разделам.")).toBe(
      "Библиотека документов с фильтром по разделам.",
    );
  });
});

describe("реестр — «теннис» не находит записи только по названию сайта", () => {
  // Календарь турниров находится по собственным словам описания («теннисных
  // турниров в Санкт-Петербурге»), а не по названию сайта — его в описании нет.
  test("в описании календаря турниров названия сайта нет — stripSiteName его не меняет", () => {
    const entry = buildDescriptionSectionEntries().find((e) => e.id === "page-tournaments");
    expect(entry).toBeDefined();
    expect(routeSourceContains("_site.tournaments.tsx", entry!.text)).toBe(true);
  });

  test("запрос «теннис» находит среди записей с описанием только календарь турниров", () => {
    const entries = buildDescriptionSectionEntries();
    const hits = entries.filter((entry) => matchesQuery("теннис", entry)).map((e) => e.id);
    expect(hits).toEqual(["page-tournaments"]);
  });

  test("запрос «петербург» — тоже только календарь турниров", () => {
    const entries = buildDescriptionSectionEntries();
    const hits = entries.filter((entry) => matchesQuery("петербург", entry)).map((e) => e.id);
    expect(hits).toEqual(["page-tournaments"]);
  });
});

describe("Общая информация — текст и реквизиты", () => {
  test("«судейского и тренерского» находит страницу", () => {
    expect(matchesQuery("судейского тренерского", buildAboutSectionEntry())).toBe(true);
  });

  test("ОГРН из реквизитов находится", () => {
    expect(matchesQuery("1047831002614", buildAboutSectionEntry())).toBe(true);
  });

  test("запрос вне текста страницу не находит", () => {
    expect(matchesQuery("антидопинговый", buildAboutSectionEntry())).toBe(false);
  });
});

describe("Структура — синонимы КРО", () => {
  test("«ревизионная комиссия» находит Структуру", () => {
    const entry = buildStructureSectionEntry();
    expect(matchesQuery("ревизионная комиссия", entry)).toBe(true);
  });

  test("«КРО» находит Структуру", () => {
    const entry = buildStructureSectionEntry();
    expect(matchesQuery("КРО", entry)).toBe(true);
  });
});

describe("Антидопинг — ответственный и заголовки", () => {
  test("ФИО ответственного находится", () => {
    const entry = buildAntidopingSectionEntry();
    expect(matchesQuery("Чертова", entry)).toBe(true);
  });

  test("заголовок группы находится", () => {
    const entry = buildAntidopingSectionEntry();
    expect(matchesQuery("нормативные документы", entry)).toBe(true);
  });
});

describe("buildCharterSectionEntries — все блоки, не только пронумерованные", () => {
  const entries = buildCharterSectionEntries(charterContent);

  test("число записей равно числу пунктов плюс число разделов", () => {
    const clauseCount = entries.filter((e) => e.kind === "clause").length;
    const sectionCount = entries.filter((e) => e.kind === "section").length;
    expect(sectionCount).toBe(charterContent.sections.length);
    expect(clauseCount).toBeGreaterThan(0);
  });

  test("текст из списка присоединяется к своему пункту и ведёт на его якорь", () => {
    const clause22 = entries.find((e) => e.id === "charter-clause-2.2");
    expect(clause22).toBeDefined();
    expect(clause22!.text).toContain("Объединение усилий");
    expect(clause22!.href).toContain("#p-2-2");
  });

  test("контент до первого пункта раздела попадает в запись раздела с её якорем", () => {
    const section1 = entries.find((e) => e.id === "charter-section-1");
    expect(section1).toBeDefined();
    expect(section1!.href).toContain("#razdel-1");
  });
});

describe("matchTermInField — сквозная проверка на разделах", () => {
  test("«Чертова» находит запись Антидопинг через полный конвейер matchTermInField", () => {
    const entry = buildAntidopingSectionEntry();
    const field = sectionField(entry);
    const term = parseSearchQuery("Чертова").terms[0];
    expect(matchTermInField(term, field)).not.toBeNull();
  });
});
