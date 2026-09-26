import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { event, eventDocument, news, newsDocument } from "@/db/schema";
import type { DatePrecision } from "@/lib/event-date";

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

/**
 * Родители документа — для блока «Приложен к» на странице документа в
 * админке. Описание источника — чтобы запрос в src/server/documents.ts был
 * написан один раз, а соответствие «связь → таблица родителя» сторожил тест
 * без БД (tests/document-link.test.ts): связь новости, соединённая с
 * таблицей событий, дала бы пустой список, а не ошибку.
 */
export type DocumentParentKind = "news" | "event";

export type DocumentParentSource = {
  kind: DocumentParentKind;
  link: DocumentLink;
  table: typeof news | typeof event;
  id: AnyPgColumn;
  title: AnyPgColumn;
  /** `published_at` новости или якорь периода события (`starts_on`). */
  date: AnyPgColumn;
  /** Точность даты события; у новости её нет — дата всегда день. */
  datePrecision: AnyPgColumn | null;
  status: AnyPgColumn;
  deletedAt: AnyPgColumn;
};

export const NEWS_PARENT: DocumentParentSource = {
  kind: "news",
  link: NEWS_LINK,
  table: news,
  id: news.id,
  title: news.title,
  date: news.publishedAt,
  datePrecision: null,
  status: news.status,
  deletedAt: news.deletedAt,
};

export const EVENT_PARENT: DocumentParentSource = {
  kind: "event",
  link: EVENT_LINK,
  table: event,
  id: event.id,
  title: event.title,
  date: event.startsOn,
  datePrecision: event.datePrecision,
  status: event.status,
  deletedAt: event.deletedAt,
};

export type ParentOfDocument = {
  kind: DocumentParentKind;
  id: string;
  title: string;
  /** `ГГГГ-ММ-ДД`. */
  date: string;
  datePrecision: DatePrecision | null;
  status: "draft" | "published";
  /**
   * Мягко удалённый родитель показывается с пометкой, а не прячется: связь
   * при мягком удалении остаётся в базе, и «Восстановить» в списке новостей
   * или событий вернёт документ на место. Спрятать его — значило бы написать
   * «ни к чему не приложен» о документе, который вернётся сам.
   */
  deleted: boolean;
};

/**
 * Порядок блока: сначала живые родители, затем удалённые; внутри — свежие
 * даты выше, при равной дате — по заголовку, затем по id (порядок не
 * зависит от выдачи базы).
 */
export function sortDocumentParents(parents: readonly ParentOfDocument[]): ParentOfDocument[] {
  return [...parents].sort(
    (a, b) =>
      Number(a.deleted) - Number(b.deleted) ||
      b.date.localeCompare(a.date) ||
      a.title.localeCompare(b.title, "ru") ||
      a.id.localeCompare(b.id),
  );
}
