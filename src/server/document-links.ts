import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { eventDocument, newsDocument } from "@/db/schema";

/**
 * Связи «документ — родитель»: news_document и event_document. Устроены
 * одинаково — та же тройка колонок, тот же составной PK, тот же каскад, —
 * поэтому attach/detach/reorder/list в src/server/documents.ts написаны один
 * раз и параметризованы связью.
 *
 * Отдельный модуль ради теста без БД (tests/document-link.test.ts): здесь
 * только `@/db/schema`, а documents.ts при импорте тянет `@/db/client`
 * (создание клиента и `create schema if not exists`) и сессию админки.
 *
 * `parentColumn` — колонка родителя в таблице связи, `parentLabel` —
 * родительный падеж для текста ошибки («этой новости», «этого события»).
 */
export type DocumentLink = {
  table: typeof newsDocument | typeof eventDocument;
  // AnyPgColumn, а не конкретные колонки: иначе тип пригвоздил бы связь к
  // news_document и event_document перестал бы подходить.
  parentColumn: AnyPgColumn;
  documentColumn: AnyPgColumn;
  positionColumn: AnyPgColumn;
  /**
   * Ключ родителя в объекте `.values()` — это имя свойства из определения
   * таблицы (`newsId`), а НЕ имя колонки в базе (`news_id`, которое лежит в
   * `parentColumn.name`). Перепутать их = вставка без родителя и падение на
   * NOT NULL. Типы здесь не помогут (`.values()` в attachDocument идёт через
   * `as never`) — соответствие сторожит tests/document-link.test.ts.
   */
  parentKey: "newsId" | "eventId";
  parentLabel: string;
};

export const NEWS_LINK: DocumentLink = {
  table: newsDocument,
  parentColumn: newsDocument.newsId,
  documentColumn: newsDocument.documentId,
  positionColumn: newsDocument.position,
  parentKey: "newsId",
  parentLabel: "этой новости",
};

export const EVENT_LINK: DocumentLink = {
  table: eventDocument,
  parentColumn: eventDocument.eventId,
  documentColumn: eventDocument.documentId,
  positionColumn: eventDocument.position,
  parentKey: "eventId",
  parentLabel: "этого события",
};
