import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { document, newsDocument } from "@/db/schema";
import { normalizeDocumentSlug } from "@/lib/document-slug";
import type { SectionCategory } from "@/lib/section-category";
import { requireSession } from "@/server/auth";
import { EVENT_LINK, NEWS_LINK, type DocumentLink } from "@/server/document-links";
import { resetNewsCache } from "@/server/news-cache";
import { buildImageUrl } from "@/server/storage";

type DocumentRow = typeof document.$inferSelect;
type Section = "federation" | "referees";
type Status = "draft" | "published";

function requireDb(): NonNullable<typeof db> {
  if (db === null) {
    throw new Error("Требуется БД (DATABASE_URL не задан), а для админки мок-фолбэка нет");
  }
  return db;
}

/**
 * Нормализует slug из ввода админки и проверяет занятость среди живых
 * записей (`deleted_at is null`), кроме самой записи `excludeId`. Частичный
 * уникальный индекс document_slug_active_idx — страховка от гонки.
 */
async function normalizeAndCheckSlug(
  database: NonNullable<typeof db>,
  input: string | null | undefined,
  excludeId?: string,
): Promise<string | null> {
  const normalized = normalizeDocumentSlug(input);
  if (!normalized.ok) {
    throw new Error(normalized.error);
  }
  if (normalized.slug !== null) {
    const conditions = [
      eq(document.slug, normalized.slug),
      isNull(document.deletedAt),
      ...(excludeId !== undefined ? [ne(document.id, excludeId)] : []),
    ];
    const [taken] = await database
      .select({ id: document.id })
      .from(document)
      .where(and(...conditions))
      .limit(1);
    if (taken) {
      throw new Error("Адрес уже занят другим документом");
    }
  }
  return normalized.slug;
}

export type ListAdminDocumentsParams = {
  section?: Section | "none";
  status?: Status;
  includeDeleted?: boolean;
};

export async function listAdminDocuments(
  params: ListAdminDocumentsParams = {},
): Promise<DocumentRow[]> {
  await requireSession();
  const database = requireDb();

  const conditions = [];
  if (params.section === "none") {
    conditions.push(isNull(document.section));
  } else if (params.section) {
    conditions.push(eq(document.section, params.section));
  }
  if (params.status) {
    conditions.push(eq(document.status, params.status));
  }
  if (!params.includeDeleted) {
    conditions.push(isNull(document.deletedAt));
  }

  return database
    .select()
    .from(document)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(document.documentDate));
}

export async function getAdminDocument(id: string): Promise<DocumentRow> {
  await requireSession();
  const database = requireDb();

  const [row] = await database.select().from(document).where(eq(document.id, id)).limit(1);
  if (!row) {
    throw new Error(`Документ не найден: ${id}`);
  }
  return row;
}

export type CreateDocumentInput = {
  title: string;
  s3Key: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  section?: Section | null;
  documentDate: string;
  status?: Status;
  inLibrary?: boolean;
  slug?: string | null;
};

/** Не заливает файл в S3 сама — как `addPhoto` в news-admin.ts, а не
 * `uploadNewsPhoto`: вызывающий код уже загрузил объект и передаёт готовый
 * `s3Key`. */
export async function createDocument(input: CreateDocumentInput): Promise<DocumentRow> {
  await requireSession();
  const database = requireDb();

  const values: typeof document.$inferInsert = {
    title: input.title,
    s3Key: input.s3Key,
    fileName: input.fileName,
    sizeBytes: input.sizeBytes,
    mimeType: input.mimeType,
    section: input.section ?? null,
    documentDate: input.documentDate,
    status: input.status ?? "draft",
    inLibrary: input.inLibrary ?? true,
    slug: await normalizeAndCheckSlug(database, input.slug),
  };

  const [row] = await database.insert(document).values(values).returning();
  return row;
}

export type UpdateDocumentInput = Partial<{
  title: string;
  fileName: string;
  s3Key: string;
  sizeBytes: number;
  mimeType: string;
  section: Section | null;
  documentDate: string;
  status: Status;
  inLibrary: boolean;
  slug: string | null;
}>;

/** Помимо метаданных принимает замену файла целиком (`s3Key`/`fileName`/
 * `sizeBytes`/`mimeType` вместе) — сценарий "выложили не ту версию
 * документа" без потери прикреплений к новостям. Старый объект в S3 при
 * замене не удаляется — общий бакет физически не трогаем. */
export async function updateDocument(id: string, input: UpdateDocumentInput): Promise<void> {
  await requireSession();
  const database = requireDb();

  // Поля перечислены явно, не через `{ ...input }` — input может прийти
  // как JSON с клиента, где типы не защищают от лишнего ключа, случайно
  // совпавшего с именем колонки (тот же приём, что updateNews в
  // news-admin.ts).
  const values: Partial<typeof document.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) values.title = input.title;
  if (input.fileName !== undefined) values.fileName = input.fileName;
  if (input.s3Key !== undefined) values.s3Key = input.s3Key;
  if (input.sizeBytes !== undefined) values.sizeBytes = input.sizeBytes;
  if (input.mimeType !== undefined) values.mimeType = input.mimeType;
  if (input.section !== undefined) values.section = input.section;
  if (input.documentDate !== undefined) values.documentDate = input.documentDate;
  if (input.status !== undefined) values.status = input.status;
  if (input.inLibrary !== undefined) values.inLibrary = input.inLibrary;
  if (input.slug !== undefined) {
    values.slug = await normalizeAndCheckSlug(database, input.slug, id);
  }

  await database.update(document).set(values).where(eq(document.id, id));
  resetNewsCache();
}

export async function softDeleteDocument(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  await database.update(document).set({ deletedAt: new Date() }).where(eq(document.id, id));
  resetNewsCache();
}

/**
 * attach/detach/reorder/list написаны один раз и параметризованы связью
 * (src/server/document-links.ts); наружу идут тонкие обёртки под каждого
 * родителя.
 */
async function attachDocument(
  link: DocumentLink,
  parentId: string,
  documentId: string,
  position?: number,
): Promise<void> {
  await requireSession();
  const database = requireDb();

  let pos = position;
  if (pos === undefined) {
    const [row] = await database
      .select({ maxPosition: sql<number | null>`max(${link.positionColumn})` })
      .from(link.table)
      .where(eq(link.parentColumn, parentId));
    pos = (row?.maxPosition ?? -1) + 1;
  }

  // `as never` отключает типы у всех трёх ключей: что это свойства таблицы
  // связи и указывают на её колонки, проверяет tests/document-link.test.ts.
  await database
    .insert(link.table)
    .values({ [link.parentKey]: parentId, documentId, position: pos } as never);
  resetNewsCache();
}

async function detachDocument(
  link: DocumentLink,
  parentId: string,
  documentId: string,
): Promise<void> {
  await requireSession();
  const database = requireDb();
  await database
    .delete(link.table)
    .where(and(eq(link.parentColumn, parentId), eq(link.documentColumn, documentId)));
  resetNewsCache();
}

async function reorderDocuments(
  link: DocumentLink,
  parentId: string,
  orderedDocumentIds: string[],
): Promise<void> {
  await requireSession();
  const database = requireDb();

  await database.transaction(async (tx) => {
    const existing = await tx
      // Тип колонки в DocumentLink обобщён до AnyPgColumn, поэтому результат
      // размечается явно — иначе documentId пришёл бы как unknown.
      .select({ documentId: sql<string>`${link.documentColumn}` })
      .from(link.table)
      .where(eq(link.parentColumn, parentId));
    const existingIds = new Set(existing.map((row) => row.documentId));
    const orderedIdSet = new Set(orderedDocumentIds);

    if (
      orderedIdSet.size !== orderedDocumentIds.length || // дубликаты в orderedDocumentIds
      existingIds.size !== orderedIdSet.size ||
      orderedDocumentIds.some((id) => !existingIds.has(id))
    ) {
      throw new Error(`Список документов не совпадает с документами ${link.parentLabel}`);
    }

    for (let index = 0; index < orderedDocumentIds.length; index++) {
      await tx
        .update(link.table)
        .set({ position: index })
        .where(
          and(eq(link.parentColumn, parentId), eq(link.documentColumn, orderedDocumentIds[index])),
        );
    }
  });

  resetNewsCache();
}

/** Документы родителя с готовым URL; мягко удалённые отфильтрованы. */
async function listLinkedDocuments(
  link: DocumentLink,
  parentId: string,
): Promise<(DocumentRow & { url: string })[]> {
  await requireSession();
  const database = requireDb();

  const rows = await database
    .select({ document })
    .from(link.table)
    .innerJoin(document, eq(link.documentColumn, document.id))
    .where(and(eq(link.parentColumn, parentId), isNull(document.deletedAt)))
    .orderBy(asc(link.positionColumn));

  return rows.map((row) => ({ ...row.document, url: buildImageUrl(row.document.s3Key) }));
}

export function attachDocumentToNews(
  newsId: string,
  documentId: string,
  position?: number,
): Promise<void> {
  return attachDocument(NEWS_LINK, newsId, documentId, position);
}

export function detachDocumentFromNews(newsId: string, documentId: string): Promise<void> {
  return detachDocument(NEWS_LINK, newsId, documentId);
}

export function reorderNewsDocuments(newsId: string, orderedDocumentIds: string[]): Promise<void> {
  return reorderDocuments(NEWS_LINK, newsId, orderedDocumentIds);
}

export function attachDocumentToEvent(
  eventId: string,
  documentId: string,
  position?: number,
): Promise<void> {
  return attachDocument(EVENT_LINK, eventId, documentId, position);
}

export function detachDocumentFromEvent(eventId: string, documentId: string): Promise<void> {
  return detachDocument(EVENT_LINK, eventId, documentId);
}

export function reorderEventDocuments(
  eventId: string,
  orderedDocumentIds: string[],
): Promise<void> {
  return reorderDocuments(EVENT_LINK, eventId, orderedDocumentIds);
}

export function getEventDocuments(eventId: string): Promise<(DocumentRow & { url: string })[]> {
  return listLinkedDocuments(EVENT_LINK, eventId);
}

/** Документы этой новости с готовым URL — для формы редактирования новости
 * в админке (по образцу listNewsPhotos в news-admin.ts). Мягко удалённые
 * документы отфильтрованы: мягкое удаление документа убирает его отовсюду
 * сразу, включая уже прикреплённые новости — иначе форма редактирования
 * новости продолжала бы показывать документ, которого уже нет ни в
 * менеджере, ни на сайте. */
export function getNewsDocuments(newsId: string): Promise<(DocumentRow & { url: string })[]> {
  return listLinkedDocuments(NEWS_LINK, newsId);
}

export type PublicNewsDocument = {
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

/** Только опубликованные и не удалённые — для публичной страницы новости.
 * `db === null` (превью без БД) возвращает пустой список, а не бросает: это
 * не админская функция, фикстуры в mock.ts под неё нет (см. план этапа 6).
 * Не вызывается из src/server/news.ts в этом PR — тот файл в этом PR не
 * трогаем, подключение к рендеру «Прикреплённые файлы» — в следующем PR. */
export async function getPublishedDocumentsForNews(newsId: string): Promise<PublicNewsDocument[]> {
  if (db === null) {
    return [];
  }

  const rows = await db
    .select({ document })
    .from(newsDocument)
    .innerJoin(document, eq(newsDocument.documentId, document.id))
    .where(
      and(
        eq(newsDocument.newsId, newsId),
        eq(document.status, "published"),
        isNull(document.deletedAt),
      ),
    )
    .orderBy(asc(newsDocument.position));

  return rows.map((row) => ({
    title: row.document.title,
    fileName: row.document.fileName,
    mimeType: row.document.mimeType,
    sizeBytes: row.document.sizeBytes,
    url: buildImageUrl(row.document.s3Key),
  }));
}

export type PublishedDocumentBySlug = {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  documentDate: string;
  s3Key: string;
};

/** Опубликованный документ по адресу постоянной страницы (document.slug).
 * Публичная функция: `db === null` (превью без БД) и отсутствие документа
 * одинаково возвращают null, не бросают — страница обязана жить без файла.
 * Колонки перечислены явно (см. комментарий в federation-person.ts): новая
 * колонка не должна автоматически утекать в SSR-ответ. */
export async function getPublishedDocumentBySlug(
  slug: string,
): Promise<PublishedDocumentBySlug | null> {
  if (db === null) {
    return null;
  }

  const [row] = await db
    .select({
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      sizeBytes: document.sizeBytes,
      mimeType: document.mimeType,
      documentDate: document.documentDate,
      s3Key: document.s3Key,
    })
    .from(document)
    .where(
      and(eq(document.slug, slug), eq(document.status, "published"), isNull(document.deletedAt)),
    )
    .limit(1);

  return row ?? null;
}

export type PublishedLibraryDocument = {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  documentDate: string;
  section: Section | null;
  s3Key: string;
};

/** Библиотека документов для /documents и /federation/documents: только
 * опубликованные, не удалённые и отмеченные `in_library`. `category`:
 * `all` — без условия по разделу, `general` — документы без раздела
 * (`section is null`), иначе — точное совпадение раздела. Публичная функция:
 * `db === null` (превью без БД) — пустой список, не бросает. Колонки
 * перечислены явно (см. getPublishedDocumentBySlug): новая колонка не
 * должна автоматически утекать в SSR-ответ; `s3Key` наружу отдаёт только
 * обёртка в documents-server-fn.ts, уже как готовый URL. */
export async function listPublishedLibraryDocuments(
  category: SectionCategory,
): Promise<PublishedLibraryDocument[]> {
  if (db === null) {
    return [];
  }

  const conditions = [
    eq(document.status, "published"),
    isNull(document.deletedAt),
    eq(document.inLibrary, true),
  ];
  if (category === "general") {
    conditions.push(isNull(document.section));
  } else if (category !== "all") {
    conditions.push(eq(document.section, category));
  }

  return db
    .select({
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      sizeBytes: document.sizeBytes,
      mimeType: document.mimeType,
      documentDate: document.documentDate,
      section: document.section,
      s3Key: document.s3Key,
    })
    .from(document)
    .where(and(...conditions))
    .orderBy(desc(document.documentDate), desc(document.createdAt));
}
