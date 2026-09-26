import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  EVENT_LINK,
  EVENT_PARENT,
  NEWS_LINK,
  NEWS_PARENT,
  sortDocumentParents,
  type DocumentLink,
  type DocumentParentSource,
  type ParentOfDocument,
} from "@/server/document-links";

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

/**
 * «Приложен к» (getDocumentParents в src/server/documents.ts) соединяет
 * таблицу связи с таблицей родителя по описанию источника. Связь новости,
 * соединённая с таблицей событий, дала бы на живой базе пустой список, а не
 * ошибку. Здесь соответствие проверяется по внешнему ключу схемы: колонка
 * родителя в связи обязана ссылаться ровно на `id` источника, а остальные
 * колонки — принадлежать таблице источника.
 */
function parentMismatches(source: DocumentParentSource): string[] {
  const problems: string[] = [];
  const fk = getTableConfig(source.link.table)
    .foreignKeys.map((key) => key.reference())
    .find((ref) => ref.columns[0] === source.link.parentColumn);
  if (fk?.foreignColumns[0] !== source.id) {
    problems.push("parentColumn связи не ссылается на id источника");
  }
  const columns = Object.values(getTableColumns(source.table)) as unknown[];
  for (const [name, column] of Object.entries({
    title: source.title,
    date: source.date,
    status: source.status,
    deletedAt: source.deletedAt,
    ...(source.datePrecision ? { datePrecision: source.datePrecision } : {}),
  })) {
    if (!columns.includes(column)) problems.push(`${name} — колонка чужой таблицы`);
  }
  return problems;
}

const PARENTS: [string, DocumentParentSource][] = [
  ["NEWS_PARENT", NEWS_PARENT],
  ["EVENT_PARENT", EVENT_PARENT],
];

describe("родители документа: связь соединяется со своей таблицей", () => {
  test.each(PARENTS)("%s: расхождений нет", (_name, source) => {
    expect(parentMismatches(source)).toEqual([]);
  });

  test("NEWS_PARENT — связь новостей, EVENT_PARENT — связь событий", () => {
    expect(NEWS_PARENT.link).toBe(NEWS_LINK);
    expect(EVENT_PARENT.link).toBe(EVENT_LINK);
    expect(NEWS_PARENT.datePrecision).toBeNull();
    expect(EVENT_PARENT.datePrecision).not.toBeNull();
  });

  test("контроль: чужая связь — расхождение по внешнему ключу", () => {
    expect(parentMismatches({ ...NEWS_PARENT, link: EVENT_LINK })).toEqual([
      "parentColumn связи не ссылается на id источника",
    ]);
    expect(parentMismatches({ ...EVENT_PARENT, link: NEWS_LINK })).toEqual([
      "parentColumn связи не ссылается на id источника",
    ]);
  });

  test("контроль: колонка чужой таблицы — расхождение", () => {
    expect(parentMismatches({ ...NEWS_PARENT, title: EVENT_PARENT.title })).toEqual([
      "title — колонка чужой таблицы",
    ]);
  });
});

const parent = (patch: Partial<ParentOfDocument>): ParentOfDocument => ({
  kind: "news",
  id: "n1",
  title: "Новость",
  date: "2020-01-01",
  datePrecision: null,
  status: "published",
  deleted: false,
  ...patch,
});

describe("sortDocumentParents", () => {
  test("живые выше удалённых, внутри — свежие даты выше", () => {
    const sorted = sortDocumentParents([
      parent({ id: "old", date: "2019-05-01" }),
      parent({ id: "deleted-new", date: "2025-01-01", deleted: true }),
      parent({ id: "event", kind: "event", date: "2021-03-01", datePrecision: "quarter" }),
      parent({ id: "new", date: "2024-01-01", status: "draft" }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["new", "event", "old", "deleted-new"]);
  });

  test("при равной дате — по заголовку", () => {
    const sorted = sortDocumentParents([
      parent({ id: "b", title: "Б" }),
      parent({ id: "a", title: "А" }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["a", "b"]);
  });

  test("пустой список — пустой", () => {
    expect(sortDocumentParents([])).toEqual([]);
  });
});

describe("getDocumentParents — только для сессии админки", () => {
  // createServerFn вызывается по HTTP напрямую, guard роута не граница
  // безопасности (CLAUDE.md). Выполнить функцию без базы нельзя, поэтому
  // проверяется исходник: первая инструкция тела — requireSession.
  const source = fs.readFileSync(
    path.resolve(import.meta.dir, "../src/server/documents.ts"),
    "utf-8",
  );
  test("тело начинается с await requireSession()", () => {
    const match = /export async function getDocumentParents\([^)]*\)[^{]*\{\s*([^\n]*)/.exec(
      source,
    );
    expect(match?.[1]).toBe("await requireSession();");
  });
});
