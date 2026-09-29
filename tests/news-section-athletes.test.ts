import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import * as adminPaging from "@/lib/admin-list-paging";
import * as sectionCategory from "@/lib/section-category";
import { sectionEnum } from "@/db/schema";

// Namespace-импорты: отсутствие экспорта даёт `undefined` → красная проверка, а не ошибка линковки.
const REPO_ROOT = join(import.meta.dir, "..");

describe("раздел новости «Наши спортсмены» — п. 2: чипы /news", () => {
  test("порядок чипов: Все · Общее · Федерация · Коллегия судей · Наши спортсмены", () => {
    expect(sectionCategory.NEWS_SECTION_CATEGORIES).toEqual([
      "all",
      "general",
      "federation",
      "referees",
      "athletes",
    ]);
  });

  test("подписи чипов", () => {
    const labels = sectionCategory.SECTION_CATEGORY_LABELS as Record<string, string>;
    expect(sectionCategory.NEWS_SECTION_CATEGORIES?.map((value) => labels[value])).toEqual([
      "Все",
      "Общее",
      "Федерация",
      "Коллегия судей",
      "Наши спортсмены",
    ]);
  });

  test("значение есть в enum БД", () => {
    expect(sectionEnum.enumValues).toContain("athletes");
  });
});

describe("раздел новости «Наши спортсмены» — п. 4: админка новостей", () => {
  test("серверная валидация новостей принимает athletes", () => {
    expect(sectionCategory.newsSectionSchema?.safeParse("athletes").success).toBe(true);
  });

  test("варианты выбора раздела в форме и фильтре", () => {
    expect(sectionCategory.NEWS_SECTION_OPTIONS).toEqual([
      { value: "federation", label: "Федерация" },
      { value: "referees", label: "Коллегия судей" },
      { value: "athletes", label: "Наши спортсмены" },
    ]);
  });

  test("параметр ?section= списка новостей принимает athletes", () => {
    expect(adminPaging.parseNewsSectionParam?.("athletes")).toBe("athletes");
  });
});

describe("раздел новости «Наши спортсмены» — п. 5: документы не меняются", () => {
  test("серверная валидация документов не принимает athletes, старые значения — принимает", () => {
    const schema = sectionCategory.documentSectionSchema;
    expect(schema?.safeParse("athletes").success).toBe(false);
    expect(schema?.safeParse("federation").success).toBe(true);
    expect(schema?.safeParse("referees").success).toBe(true);
  });

  test("параметр ?section= списка документов не принимает athletes", () => {
    expect(adminPaging.parseDocumentSectionParam?.("athletes")).toBe("all");
    expect(adminPaging.parseDocumentSectionParam?.("referees")).toBe("referees");
  });

  test("чипы документов — прежние четыре", () => {
    expect(sectionCategory.DOCUMENT_SECTION_CATEGORIES).toEqual([
      "all",
      "general",
      "federation",
      "referees",
    ]);
  });

  test("документные админ-файлы и публичные страницы не упоминают athletes", () => {
    const files = [
      "src/routes/admin/_authed/documents.index.tsx",
      "src/routes/admin/_authed/-components/DocumentForm.tsx",
      "src/routes/admin/_authed/-components/DocumentUploadDialog.tsx",
      "src/routes/admin/_authed/-components/DocumentAttachDialog.tsx",
      "src/routes/admin/_authed/-components/DocumentGallery.tsx",
      "src/routes/_site.documents.tsx",
      "src/routes/_site.federation.documents.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      expect({ file, hit: /athletes|NEWS_SECTION/.test(source) }).toEqual({ file, hit: false });
    }
  });
});
