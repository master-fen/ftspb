import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  checkSlugAvailable as checkSlugAvailableImpl,
  createNews as createNewsImpl,
  deletePhotoAndS3Object as deletePhotoAndS3ObjectImpl,
  getAdminNews as getAdminNewsImpl,
  listAdminNews as listAdminNewsImpl,
  listNewsPhotos as listNewsPhotosImpl,
  reorderPhotos as reorderPhotosImpl,
  restoreNews as restoreNewsImpl,
  setCoverPhoto as setCoverPhotoImpl,
  softDeleteNews as softDeleteNewsImpl,
  suggestSlug as suggestSlugImpl,
  updateNews as updateNewsImpl,
  updatePhoto as updatePhotoImpl,
} from "@/server/news-admin";

/**
 * `src/server/**` запрещён к прямому импорту из клиентского бандла
 * (import-protection плагин TanStack Start — route-модули собираются и в
 * клиент, и в сервер). `createServerFn` — санкционированный обход: тело
 * `.handler()` компилируется только в серверный чанк, на клиенте остаётся
 * RPC-заглушка.
 *
 * `featured`/`featuredOrder` сюда сознательно не включены — управление
 * подборкой на главной ещё не готово принимать значение «меньше трёх»,
 * см. CLAUDE.md/план этапа (отдельный PR после фото).
 */

const sectionSchema = z.enum(["federation", "referees"]);
const statusSchema = z.enum(["draft", "published"]);

export const listAdminNews = createServerFn({ method: "GET" })
  .validator(
    z.object({
      q: z.string().optional(),
      section: z.union([sectionSchema, z.literal("none")]).optional(),
      status: statusSchema.optional(),
      includeDeleted: z.boolean().optional(),
    }),
  )
  .handler(({ data }) => listAdminNewsImpl(data));

export const getAdminNews = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(({ data }) => getAdminNewsImpl(data));

export const createNews = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: z.string().min(1),
      title: z.string().min(1),
      publishedAt: z.string().min(1),
      excerpt: z.string().nullable().optional(),
      body: z.string().nullable().optional(),
      section: sectionSchema.nullable().optional(),
      status: statusSchema.optional(),
    }),
  )
  .handler(({ data }) => createNewsImpl(data));

export const updateNews = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().min(1),
      input: z.object({
        slug: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        publishedAt: z.string().min(1).optional(),
        excerpt: z.string().nullable().optional(),
        body: z.string().nullable().optional(),
        section: sectionSchema.nullable().optional(),
        status: statusSchema.optional(),
      }),
    }),
  )
  .handler(({ data }) => updateNewsImpl(data.id, data.input));

export const softDeleteNews = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }) => softDeleteNewsImpl(data));

export const restoreNews = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }) => restoreNewsImpl(data));

export const checkSlugAvailable = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1), excludeId: z.string().optional() }))
  .handler(({ data }) => checkSlugAvailableImpl(data.slug, data.excludeId));

export const suggestSlug = createServerFn({ method: "GET" })
  .validator(z.object({ title: z.string().min(1), publishedAt: z.string().min(1) }))
  .handler(({ data }) => suggestSlugImpl(data.title, data.publishedAt));

export const listNewsPhotos = createServerFn({ method: "GET" })
  .validator((newsId: string) => newsId)
  .handler(({ data }) => listNewsPhotosImpl(data));

export const updatePhoto = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1), alt: z.string().nullable() }))
  .handler(({ data }) => updatePhotoImpl(data.id, { alt: data.alt }));

export const reorderPhotos = createServerFn({ method: "POST" })
  .validator(z.object({ newsId: z.string().min(1), orderedIds: z.array(z.string().min(1)) }))
  .handler(({ data }) => reorderPhotosImpl(data.newsId, data.orderedIds));

export const setCoverPhoto = createServerFn({ method: "POST" })
  .validator(z.object({ newsId: z.string().min(1), photoId: z.string().min(1) }))
  .handler(({ data }) => setCoverPhotoImpl(data.newsId, data.photoId));

export const deletePhoto = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }) => deletePhotoAndS3ObjectImpl(data));
