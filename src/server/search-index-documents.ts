/**
 * Построение части индекса поиска для документов — опубликованные и
 * неудалённые. Поле — только название (у документа нет тела).
 *
 * Ссылка на файл — по правилу «Строка документа» задания, три случая:
 * 1. документ со своим `slug` (постоянная страница, например Устав) —
 *    ссылка на эту страницу;
 * 2. `in_library = true` без своего `slug` — та же ссылка, что на
 *    `/documents` (`buildImageUrl`, внешняя);
 * 3. `in_library = false` — та же ссылка, что на странице родителя, плюс
 *    сведения для строки «в новости/событии «…», ДАТА»; без опубликованного
 *    родителя документ в индекс не попадает вовсе.
 *
 * Случай 1 сейчас опирается на явный список известных маршрутов — в
 * репозитории нет общего маршрута «страница документа по slug», каждая
 * постоянная страница (пока одна — Устав) заведена отдельным файлом
 * маршрута с захардкоженным slug (`CHARTER_DOCUMENT_SLUG`,
 * `src/lib/charter/meta.ts`). Slug документа без известного маршрута —
 * такого на данных быть не должно (slug выставляется редактором вручную
 * именно ради уже существующей страницы), но на случай расхождения
 * документ в этом случае обрабатывается как обычный `in_library`/архивный,
 * а не остаётся без ссылки.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { db as Db } from "@/db/client";
import { document } from "@/db/schema";
import { CHARTER_DOCUMENT_SLUG } from "@/lib/charter/meta";
import { buildFieldWithPositions, type FieldWithPositions } from "@/lib/search-field-index";
import { visibleText } from "@/lib/search-text";
import {
  getPublishedParentsForDocuments,
  type PublishedDocumentParent,
} from "@/server/search-document-parents";
import { buildImageUrl } from "@/server/storage";

/** slug документа → адрес его постоянной страницы (см. doc-comment модуля). */
const KNOWN_DOCUMENT_SLUG_ROUTES: Record<string, string> = {
  [CHARTER_DOCUMENT_SLUG]: "/federation/charter",
};

export type DocumentIndexItem = {
  id: string;
  href: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  documentDate: string;
  createdAt: string;
  title: FieldWithPositions;
  /** Только для документов вне общего списка (случай 3 выше). */
  parent: PublishedDocumentParent | null;
};

export async function buildDocumentsIndex(
  database: NonNullable<typeof Db>,
  intern: (value: string) => string,
): Promise<DocumentIndexItem[]> {
  const rows = await database
    .select({
      id: document.id,
      title: document.title,
      slug: document.slug,
      inLibrary: document.inLibrary,
      s3Key: document.s3Key,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      documentDate: document.documentDate,
      createdAt: document.createdAt,
    })
    .from(document)
    .where(and(eq(document.status, "published"), isNull(document.deletedAt)));

  const outsideLibraryIds = rows
    .filter(
      (row) => !row.inLibrary && (row.slug === null || !(row.slug in KNOWN_DOCUMENT_SLUG_ROUTES)),
    )
    .map((row) => row.id);
  const parentsById = await getPublishedParentsForDocuments(database, outsideLibraryIds);

  const items: DocumentIndexItem[] = [];
  for (const row of rows) {
    const ownPageHref = row.slug !== null ? KNOWN_DOCUMENT_SLUG_ROUTES[row.slug] : undefined;

    let href: string;
    let parent: PublishedDocumentParent | null = null;

    if (ownPageHref) {
      href = ownPageHref;
    } else if (row.inLibrary) {
      href = buildImageUrl(row.s3Key);
    } else {
      const found = parentsById.get(row.id);
      if (!found) continue; // без опубликованного родителя — не индексируется
      href = buildImageUrl(row.s3Key);
      parent = found;
    }

    items.push({
      id: row.id,
      href,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      documentDate: row.documentDate,
      createdAt: row.createdAt.toISOString(),
      title: buildFieldWithPositions(visibleText(row.title), intern),
      parent,
    });
  }
  return items;
}
