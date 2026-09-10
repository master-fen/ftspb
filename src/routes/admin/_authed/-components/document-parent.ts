import {
  attachDocumentToEvent,
  attachDocumentToNews,
  detachDocumentFromEvent,
  detachDocumentFromNews,
  getEventDocuments,
  getNewsDocuments,
  reorderEventDocuments,
  reorderNewsDocuments,
} from "@/lib/documents-server-fn";

/**
 * Адаптер родителя для галереи документов. Новость и событие используют один
 * и тот же компонент (DocumentGallery) и те же диалоги; различие — только в
 * четырёх серверных функциях и в ключе кэша.
 *
 * Серверные функции у родителей разные, потому что различаются имена полей в
 * payload (`newsId` / `eventId`). Реализация под ними общая — см.
 * src/server/documents.ts.
 */

export type AttachedDocument = Awaited<ReturnType<typeof getNewsDocuments>>[number];

export type DocumentParent = {
  /** Только для ключа react-query — на сервер не уходит. */
  kind: "news" | "event";
  id: string;
  /** Родительный падеж для подписей: «этой новости», «этому событию». */
  labelDative: string;
  list: () => Promise<AttachedDocument[]>;
  attach: (documentId: string) => Promise<void>;
  detach: (documentId: string) => Promise<void>;
  reorder: (orderedDocumentIds: string[]) => Promise<void>;
};

export const documentsQueryKey = (parent: DocumentParent) =>
  [`${parent.kind}-documents`, parent.id] as const;

export function newsDocumentParent(newsId: string): DocumentParent {
  return {
    kind: "news",
    id: newsId,
    labelDative: "новости",
    list: () => getNewsDocuments({ data: newsId }),
    attach: (documentId) => attachDocumentToNews({ data: { newsId, documentId } }),
    detach: (documentId) => detachDocumentFromNews({ data: { newsId, documentId } }),
    reorder: (orderedDocumentIds) => reorderNewsDocuments({ data: { newsId, orderedDocumentIds } }),
  };
}

export function eventDocumentParent(eventId: string): DocumentParent {
  return {
    kind: "event",
    id: eventId,
    labelDative: "событию",
    list: () => getEventDocuments({ data: eventId }),
    attach: (documentId) => attachDocumentToEvent({ data: { eventId, documentId } }),
    detach: (documentId) => detachDocumentFromEvent({ data: { eventId, documentId } }),
    reorder: (orderedDocumentIds) =>
      reorderEventDocuments({ data: { eventId, orderedDocumentIds } }),
  };
}
