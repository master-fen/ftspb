/**
 * Родитель документа вне общего списка (`in_library = false`) для
 * публичного поиска — не переиспользует сессионно-защищённый
 * `getDocumentParents`/`listParentsOf` (src/server/documents.ts): тот отдаёт
 * и черновики, и мягко удалённых родителей, с пометкой, для админки.
 * Здесь — batched-запрос по всем документам сразу (не N+1) с условием
 * «опубликован и не удалён».
 *
 * Порядок выбора при родителях обоих типов — новость всегда побеждает
 * событие (published_at и starts_on — разные оси времени: дата публикации
 * против даты мероприятия, сравнивать напрямую нельзя); тай-брейк внутри
 * каждого типа — как у соответствующей ленты. См. docs/decisions.md.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { event, eventDocument, news, newsDocument } from "@/db/schema";

export type PublishedDocumentParent = {
  kind: "news" | "event";
  title: string;
  /** `published_at` новости или `starts_on` события, `ГГГГ-ММ-ДД`. */
  dateIso: string;
  href: string;
};

async function listPublishedNewsParents(
  database: NonNullable<typeof db>,
  documentIds: readonly string[],
): Promise<Map<string, PublishedDocumentParent>> {
  const rows = await database
    .select({
      documentId: newsDocument.documentId,
      slug: news.slug,
      title: news.title,
      publishedAt: news.publishedAt,
      createdAt: news.createdAt,
      id: news.id,
    })
    .from(newsDocument)
    .innerJoin(news, eq(newsDocument.newsId, news.id))
    .where(
      and(
        inArray(newsDocument.documentId, documentIds as string[]),
        eq(news.status, "published"),
        isNull(news.deletedAt),
      ),
    )
    .orderBy(desc(news.publishedAt), desc(news.createdAt), desc(news.id));

  const map = new Map<string, PublishedDocumentParent>();
  for (const row of rows) {
    if (map.has(row.documentId)) continue; // порядок desc — первое вхождение уже самое свежее
    map.set(row.documentId, {
      kind: "news",
      title: row.title,
      dateIso: row.publishedAt,
      href: `/news/${row.slug}`,
    });
  }
  return map;
}

async function listPublishedEventParents(
  database: NonNullable<typeof db>,
  documentIds: readonly string[],
): Promise<Map<string, PublishedDocumentParent>> {
  const rows = await database
    .select({
      documentId: eventDocument.documentId,
      slug: event.slug,
      title: event.title,
      startsOn: event.startsOn,
      createdAt: event.createdAt,
      id: event.id,
    })
    .from(eventDocument)
    .innerJoin(event, eq(eventDocument.eventId, event.id))
    .where(
      and(
        inArray(eventDocument.documentId, documentIds as string[]),
        eq(event.status, "published"),
        isNull(event.deletedAt),
      ),
    )
    .orderBy(desc(event.startsOn), desc(event.createdAt), desc(event.id));

  const map = new Map<string, PublishedDocumentParent>();
  for (const row of rows) {
    if (map.has(row.documentId)) continue;
    map.set(row.documentId, {
      kind: "event",
      title: row.title,
      dateIso: row.startsOn,
      href: `/federation/events/${row.slug}`,
    });
  }
  return map;
}

/**
 * Родитель документа для каждого id из `documentIds` — новость, если у
 * документа есть хоть одна опубликованная новость-родитель (самая свежая),
 * иначе самое позднее опубликованное событие-родитель, иначе документ в
 * карту не попадает (вызывающая сторона просто не найдёт его id в Map).
 */
export async function getPublishedParentsForDocuments(
  database: NonNullable<typeof db>,
  documentIds: readonly string[],
): Promise<Map<string, PublishedDocumentParent>> {
  if (documentIds.length === 0) return new Map();
  const [newsParents, eventParents] = await Promise.all([
    listPublishedNewsParents(database, documentIds),
    listPublishedEventParents(database, documentIds),
  ]);
  const result = new Map<string, PublishedDocumentParent>();
  for (const documentId of documentIds) {
    const newsParent = newsParents.get(documentId);
    if (newsParent) {
      result.set(documentId, newsParent);
      continue;
    }
    const eventParent = eventParents.get(documentId);
    if (eventParent) result.set(documentId, eventParent);
  }
  return result;
}
