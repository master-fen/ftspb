import { describe, expect, test } from "bun:test";
import { getTableColumns } from "drizzle-orm";
import { EVENT_LINK, NEWS_LINK, type DocumentLink } from "@/server/document-links";

/**
 * attachDocument (src/server/documents.ts) вставляет в таблицу связи объект
 * `{ [link.parentKey]: …, documentId: …, position: … }` через `as never` —
 * типы там отключены. Ошибка в ключе (имя колонки базы `news_id` вместо
 * свойства `newsId`) проявилась бы только на живой базе. Здесь то же
 * соответствие проверяется без БД: `getTableColumns` отдаёт колонки по именам
 * свойств таблицы Drizzle, и каждый ключ обязан указывать ровно на ту колонку
 * (сравнение ссылок, `!==`), которую связь использует в запросах.
 */
function linkMismatches(link: DocumentLink): string[] {
  const columns: Record<string, unknown> = getTableColumns(link.table);
  const problems: string[] = [];
  if (columns[link.parentKey] !== link.parentColumn) {
    problems.push(`parentKey «${link.parentKey}» не указывает на parentColumn`);
  }
  if (columns.documentId !== link.documentColumn) {
    problems.push("documentId не указывает на documentColumn");
  }
  if (columns.position !== link.positionColumn) {
    problems.push("position не указывает на positionColumn");
  }
  return problems;
}

const LINKS: [string, DocumentLink, string][] = [
  ["NEWS_LINK", NEWS_LINK, "news_id"],
  ["EVENT_LINK", EVENT_LINK, "event_id"],
];

describe("связи документов: ключи .values() — свойства таблицы связи", () => {
  test.each(LINKS)("%s: расхождений нет", (_name, link) => {
    expect(linkMismatches(link)).toEqual([]);
  });

  test.each(LINKS)("%s: parentColumn — колонка базы %s", (_name, link, dbColumn) => {
    expect(link.parentColumn.name).toBe(dbColumn);
  });
});

describe("контроль: проверка ловит подмену ключа", () => {
  test.each(LINKS)("%s: parentKey = имя колонки базы — расхождение", (_name, link, dbColumn) => {
    // Ровно та ошибка, от которой защищает тест: вместо свойства — имя колонки.
    const broken = { ...link, parentKey: dbColumn } as unknown as DocumentLink;
    expect(broken.parentKey as string).toBe(dbColumn);
    expect(linkMismatches(broken)).toEqual([
      `parentKey «${dbColumn}» не указывает на parentColumn`,
    ]);
  });

  test("parentKey чужой связи — расхождение", () => {
    expect(linkMismatches({ ...NEWS_LINK, parentKey: EVENT_LINK.parentKey })).toHaveLength(1);
    expect(linkMismatches({ ...EVENT_LINK, parentKey: NEWS_LINK.parentKey })).toHaveLength(1);
  });
});
