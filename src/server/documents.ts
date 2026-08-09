import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { document, newsDocument } from "@/db/schema";
import { getCurrentSession } from "@/server/auth";
import { buildImageUrl, resetNewsCache } from "@/server/news";

type DocumentRow = typeof document.$inferSelect;
type Section = "federation" | "referees";
type Status = "draft" | "published";

function requireDb(): NonNullable<typeof db> {
  if (db === null) {
    throw new Error("Требуется БД (DATABASE_URL не задан), а для админки мок-фолбэка нет");
  }
  return db;
}

/** Guard в src/routes/admin/_authed/route.tsx — навигационный, не граница
 * безопасности (см. CLAUDE.md). Каждая функция этого файла проверяет
 * активную сессию сама, первой строкой. */
async function requireSession() {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Требуется активная сессия администратора");
  }
  return session;
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

  await database.update(document).set(values).where(eq(document.id, id));
  resetNewsCache();
}

export async function softDeleteDocument(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  await database.update(document).set({ deletedAt: new Date() }).where(eq(document.id, id));
  resetNewsCache();
}

export async function attachDocumentToNews(
  newsId: string,
  documentId: string,
  position?: number,
): Promise<void> {
  await requireSession();
  const database = requireDb();

  let pos = position;
  if (pos === undefined) {
    const [row] = await database
      .select({ maxPosition: sql<number | null>`max(${newsDocument.position})` })
      .from(newsDocument)
      .where(eq(newsDocument.newsId, newsId));
    pos = (row?.maxPosition ?? -1) + 1;
  }

  await database.insert(newsDocument).values({ newsId, documentId, position: pos });
  resetNewsCache();
}

export async function detachDocumentFromNews(newsId: string, documentId: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  await database
    .delete(newsDocument)
    .where(and(eq(newsDocument.newsId, newsId), eq(newsDocument.documentId, documentId)));
  resetNewsCache();
}

export async function reorderNewsDocuments(
  newsId: string,
  orderedDocumentIds: string[],
): Promise<void> {
  await requireSession();
  const database = requireDb();

  await database.transaction(async (tx) => {
    const existing = await tx
      .select({ documentId: newsDocument.documentId })
      .from(newsDocument)
      .where(eq(newsDocument.newsId, newsId));
    const existingIds = new Set(existing.map((row) => row.documentId));
    const orderedIdSet = new Set(orderedDocumentIds);

    if (
      orderedIdSet.size !== orderedDocumentIds.length || // дубликаты в orderedDocumentIds
      existingIds.size !== orderedIdSet.size ||
      orderedDocumentIds.some((id) => !existingIds.has(id))
    ) {
      throw new Error("Список документов не совпадает с документами этой новости");
    }

    for (let index = 0; index < orderedDocumentIds.length; index++) {
      await tx
        .update(newsDocument)
        .set({ position: index })
        .where(
          and(
            eq(newsDocument.newsId, newsId),
            eq(newsDocument.documentId, orderedDocumentIds[index]),
          ),
        );
    }
  });

  resetNewsCache();
}

/** Документы этой новости с готовым URL — для формы редактирования новости
 * в админке (по образцу listNewsPhotos в news-admin.ts). Мягко удалённые
 * документы отфильтрованы: мягкое удаление документа убирает его отовсюду
 * сразу, включая уже прикреплённые новости — иначе форма редактирования
 * новости продолжала бы показывать документ, которого уже нет ни в
 * менеджере, ни на сайте. */
export async function getNewsDocuments(newsId: string): Promise<(DocumentRow & { url: string })[]> {
  await requireSession();
  const database = requireDb();

  const rows = await database
    .select({ document })
    .from(newsDocument)
    .innerJoin(document, eq(newsDocument.documentId, document.id))
    .where(and(eq(newsDocument.newsId, newsId), isNull(document.deletedAt)))
    .orderBy(asc(newsDocument.position));

  return rows.map((row) => ({ ...row.document, url: buildImageUrl(row.document.s3Key) }));
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
