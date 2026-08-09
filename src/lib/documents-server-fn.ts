import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createDocument as createDocumentImpl,
  getAdminDocument as getAdminDocumentImpl,
  listAdminDocuments as listAdminDocumentsImpl,
  softDeleteDocument as softDeleteDocumentImpl,
  updateDocument as updateDocumentImpl,
} from "@/server/documents";
import { buildImageUrl } from "@/server/news";

/**
 * `src/server/**` запрещён к прямому импорту из клиентского бандла
 * (import-protection плагин TanStack Start) — `createServerFn` санкционированный
 * обход, см. news-admin-server-fn.ts.
 *
 * getAdminDocument/listAdminDocuments в src/server/documents.ts не отдают
 * готовый URL файла (в отличие от getNewsDocuments) — домапливаем его здесь,
 * через ту же публичную buildImageUrl из src/server/news.ts, не трогая
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
      }),
    }),
  )
  .handler(({ data }) => updateDocumentImpl(data.id, data.input));

export const softDeleteDocument = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }) => softDeleteDocumentImpl(data));
