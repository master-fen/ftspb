import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DOCUMENT_SLUG_PATTERN } from "@/lib/document-slug";
import { SECTION_CATEGORIES } from "@/lib/section-category";
import {
  attachDocumentToEvent as attachDocumentToEventImpl,
  attachDocumentToNews as attachDocumentToNewsImpl,
  createDocument as createDocumentImpl,
  detachDocumentFromEvent as detachDocumentFromEventImpl,
  detachDocumentFromNews as detachDocumentFromNewsImpl,
  getAdminDocument as getAdminDocumentImpl,
  getEventDocuments as getEventDocumentsImpl,
  getNewsDocuments as getNewsDocumentsImpl,
  getPublishedDocumentBySlug as getPublishedDocumentBySlugImpl,
  listAdminDocuments as listAdminDocumentsImpl,
  listPublishedLibraryDocuments as listPublishedLibraryDocumentsImpl,
  reorderEventDocuments as reorderEventDocumentsImpl,
  reorderNewsDocuments as reorderNewsDocumentsImpl,
  softDeleteDocument as softDeleteDocumentImpl,
  updateDocument as updateDocumentImpl,
} from "@/server/documents";
import { buildImageUrl } from "@/server/storage";

/**
 * `src/server/**` запрещён к прямому импорту из клиентского бандла
 * (import-protection плагин TanStack Start) — `createServerFn` санкционированный
 * обход, см. news-admin-server-fn.ts.
 *
 * getAdminDocument/listAdminDocuments в src/server/documents.ts не отдают
 * готовый URL файла (в отличие от getNewsDocuments) — домапливаем его здесь,
 * через ту же публичную buildImageUrl из src/server/storage.ts, не трогая
 * src/server/documents.ts.
 */

const sectionSchema = z.enum(["federation", "referees"]);
const statusSchema = z.enum(["draft", "published"]);

export const listAdminDocuments = createServerFn({ method: "GET" })
  .validator(
    z.object({
      section: z.union([sectionSchema, z.literal("none")]).optional(),
      status: statusSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const rows = await listAdminDocumentsImpl(data);
    return rows.map((row) => ({ ...row, url: buildImageUrl(row.s3Key) }));
  });

export const getAdminDocument = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const row = await getAdminDocumentImpl(data);
    return { ...row, url: buildImageUrl(row.s3Key) };
  });

export const createDocument = createServerFn({ method: "POST" })
  .validator(
    z.object({
      title: z.string().min(1),
      s3Key: z.string().min(1),
      fileName: z.string().min(1),
      sizeBytes: z.number().int().min(0),
      mimeType: z.string().min(1),
      section: sectionSchema.nullable().optional(),
      documentDate: z.string().min(1),
      status: statusSchema.optional(),
      inLibrary: z.boolean().optional(),
      slug: z.string().nullable().optional(),
    }),
  )
  .handler(({ data }) => createDocumentImpl(data));

export const updateDocument = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().min(1),
      input: z.object({
        title: z.string().min(1).optional(),
        fileName: z.string().min(1).optional(),
        s3Key: z.string().min(1).optional(),
        sizeBytes: z.number().int().min(0).optional(),
        mimeType: z.string().min(1).optional(),
        section: sectionSchema.nullable().optional(),
        documentDate: z.string().min(1).optional(),
        status: statusSchema.optional(),
        inLibrary: z.boolean().optional(),
        slug: z.string().nullable().optional(),
      }),
    }),
  )
  .handler(({ data }) => updateDocumentImpl(data.id, data.input));

export const softDeleteDocument = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }) => softDeleteDocumentImpl(data));

export const getNewsDocuments = createServerFn({ method: "GET" })
  .validator((newsId: string) => newsId)
  .handler(({ data }) => getNewsDocumentsImpl(data));

export const attachDocumentToNews = createServerFn({ method: "POST" })
  .validator(z.object({ newsId: z.string().min(1), documentId: z.string().min(1) }))
  .handler(({ data }) => attachDocumentToNewsImpl(data.newsId, data.documentId));

export const detachDocumentFromNews = createServerFn({ method: "POST" })
  .validator(z.object({ newsId: z.string().min(1), documentId: z.string().min(1) }))
  .handler(({ data }) => detachDocumentFromNewsImpl(data.newsId, data.documentId));

export const reorderNewsDocuments = createServerFn({ method: "POST" })
  .validator(
    z.object({ newsId: z.string().min(1), orderedDocumentIds: z.array(z.string().min(1)) }),
  )
  .handler(({ data }) => reorderNewsDocumentsImpl(data.newsId, data.orderedDocumentIds));

/**
 * Те же четыре операции для событий. Реализация в src/server/documents.ts
 * общая — здесь только отдельные RPC-точки под своего родителя.
 */
export const getEventDocuments = createServerFn({ method: "GET" })
  .validator((eventId: string) => eventId)
  .handler(({ data }) => getEventDocumentsImpl(data));

export const attachDocumentToEvent = createServerFn({ method: "POST" })
  .validator(z.object({ eventId: z.string().min(1), documentId: z.string().min(1) }))
  .handler(({ data }) => attachDocumentToEventImpl(data.eventId, data.documentId));

export const detachDocumentFromEvent = createServerFn({ method: "POST" })
  .validator(z.object({ eventId: z.string().min(1), documentId: z.string().min(1) }))
  .handler(({ data }) => detachDocumentFromEventImpl(data.eventId, data.documentId));

export const reorderEventDocuments = createServerFn({ method: "POST" })
  .validator(
    z.object({ eventId: z.string().min(1), orderedDocumentIds: z.array(z.string().min(1)) }),
  )
  .handler(({ data }) => reorderEventDocumentsImpl(data.eventId, data.orderedDocumentIds));

/** Публичная выдача опубликованного документа по адресу постоянной страницы.
 * `s3Key` наружу не уходит — как photoUrl у персон: наружу только готовый URL. */
export const getPublishedDocumentBySlug = createServerFn({ method: "GET" })
  .validator(z.string().regex(DOCUMENT_SLUG_PATTERN))
  .handler(async ({ data }) => {
    const row = await getPublishedDocumentBySlugImpl(data);
    if (row === null) {
      return null;
    }
    return {
      title: row.title,
      fileName: row.fileName,
      sizeBytes: row.sizeBytes,
      mimeType: row.mimeType,
      documentDate: row.documentDate,
      url: buildImageUrl(row.s3Key),
    };
  });

/** Публичная библиотека документов (/documents, /federation/documents) по
 * разделу. `s3Key` наружу не уходит — только готовый `url`. */
export const listPublishedLibraryDocuments = createServerFn({ method: "GET" })
  .validator(z.enum(SECTION_CATEGORIES))
  .handler(async ({ data }) => {
    const rows = await listPublishedLibraryDocumentsImpl(data);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      fileName: row.fileName,
      sizeBytes: row.sizeBytes,
      mimeType: row.mimeType,
      documentDate: row.documentDate,
      section: row.section,
      url: buildImageUrl(row.s3Key),
    }));
  });
