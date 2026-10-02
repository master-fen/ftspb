import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MIN_ARCHIVE_YEAR } from "@/lib/admin-list-paging";
import { normalizeSearchQuery } from "@/lib/search-text";
import { newsSectionSchema } from "@/lib/section-category";
import {
  checkSlugAvailable as checkSlugAvailableImpl,
  createNews as createNewsImpl,
  createNewsShareLink as createNewsShareLinkImpl,
  deletePhotoAndS3Object as deletePhotoAndS3ObjectImpl,
  getAdminNews as getAdminNewsImpl,
  getNewsShareLink as getNewsShareLinkImpl,
  listAdminNews as listAdminNewsImpl,
  listAdminNewsYears as listAdminNewsYearsImpl,
  listNewsPhotos as listNewsPhotosImpl,
  reorderPhotos as reorderPhotosImpl,
  restoreNews as restoreNewsImpl,
  revokeNewsShareLink as revokeNewsShareLinkImpl,
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
 */

const sectionSchema = newsSectionSchema;
const statusSchema = z.enum(["draft", "published"]);

/** Верхняя граница — от текущей даты на момент запроса, не при старте
 *  процесса: сервер живёт дольше года между деплоями. */
const yearSchema = z
  .number()
  .int()
  .min(MIN_ARCHIVE_YEAR)
  .refine((year) => year <= new Date().getFullYear() + 1, "Год вне допустимого диапазона")
  .optional();

export const listAdminNews = createServerFn({ method: "GET" })
  .validator(
    z.object({
      q: z.string().optional(),
      section: z.union([sectionSchema, z.literal("none")]).optional(),
      status: statusSchema.optional(),
      includeDeleted: z.boolean().optional(),
      year: yearSchema,
      source: z.enum(["archive", "manual"]).optional(),
      page: z.number().int().min(1).max(100000),
    }),
  )
  .handler(({ data }) => listAdminNewsImpl({ ...data, q: normalizeSearchQuery(data.q) }));

export const listAdminNewsYears = createServerFn({ method: "GET" }).handler(() =>
  listAdminNewsYearsImpl(),
);

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
      featured: z.boolean().optional(),
      featuredOrder: z.number().int().min(0).nullable().optional(),
      // Форма payload; правила (kinescope.io, embed-адрес) — в src/lib/news-video-url.ts,
      // применяет src/server/news-admin.ts.
      videoUrl: z.string().nullable().optional(),
      hideCoverOnPage: z.boolean().optional(),
      eventId: z.string().nullable().optional(),
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
        featured: z.boolean().optional(),
        featuredOrder: z.number().int().min(0).nullable().optional(),
        videoUrl: z.string().nullable().optional(),
        hideCoverOnPage: z.boolean().optional(),
        eventId: z.string().nullable().optional(),
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

/** Ссылка на черновик для согласования — состояние, создание (и замена), отзыв. */
export const getNewsShareLink = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(({ data }) => getNewsShareLinkImpl(data));

export const createNewsShareLink = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }) => createNewsShareLinkImpl(data));

export const revokeNewsShareLink = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }) => revokeNewsShareLinkImpl(data));

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
