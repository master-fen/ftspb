import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { ARCHIVE_DOCUMENT_IN_LIBRARY, archiveDocumentValues } from "./archive-document-values";

/**
 * Архивный документ не попадает в общий список документов: `in_library`
 * у строк мигратора — false. Два пути вставки (поштучный и `--replace-all`)
 * обязаны брать значения из archiveDocumentValues, а не собирать свои.
 */

const migrator = fs.readFileSync(path.join(import.meta.dir, "migrate-archive.ts"), "utf-8");

describe("архивные документы — вне общего списка", () => {
  test("archiveDocumentValues пишет inLibrary: false", () => {
    const values = archiveDocumentValues(
      { title: "Новость", section: null, publishedAt: "2019-05-01" },
      { s3Key: "news/slug/documents/01.pdf", mimeType: "application/pdf", sizeBytes: 10 },
    );
    expect(ARCHIVE_DOCUMENT_IN_LIBRARY).toBe(false);
    expect(values.inLibrary).toBe(false);
    expect(values.fileName).toBe("01.pdf");
    expect(values.status).toBe("published");
  });

  test("мигратор вставляет document ровно в двух местах, оба — через archiveDocumentValues", () => {
    const sites = [...migrator.matchAll(/\.insert\(document\)\s*\.values\(/g)].map((m) => {
      const start = (m.index ?? 0) + m[0].length;
      return migrator.slice(start, start + 60).replace(/\s+/g, " ");
    });
    // Положительный контроль разбора: ноль мест прошёл бы проверку ниже вхолостую.
    expect(sites.length).toBe(2);
    for (const site of sites) {
      expect(site).toMatch(/^archiveDocumentValues\(\w+, \w+\)\)/);
    }
  });

  test("в мигратор не вписано своё значение inLibrary", () => {
    // Перекрытие вида { ...archiveDocumentValues(…), inLibrary: true } или
    // отдельный update после вставки.
    expect(migrator.match(/inLibrary|in_library/g) ?? []).toEqual([]);
  });
});
