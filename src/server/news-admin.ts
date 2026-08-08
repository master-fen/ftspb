import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { news, newsPhoto } from "@/db/schema";
import { EXTENSION_BY_TYPE, type SupportedImageType } from "@/lib/image-validation";
import { getCurrentSession } from "@/server/auth";
import { buildImageUrl, resetNewsCache } from "@/server/news";
import { sanitizeBody } from "@/server/sanitize";
import { slugify } from "@/server/slug";
import { deleteObject, objectExists, uploadObject } from "@/server/storage";

type NewsRow = typeof news.$inferSelect;
type NewsPhotoRow = typeof newsPhoto.$inferSelect;
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

/** Postgres unique_violation — коллизия slug на уровне constraint БД (гонка
 * между проверкой checkSlugAvailable и вставкой), а не голый PostgresError. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
  const database = requireDb();
  const conditions = [eq(news.slug, slug)];
  if (excludeId) {
    conditions.push(ne(news.id, excludeId));
  }
  const rows = await database
    .select({ id: news.id })
    .from(news)
    .where(and(...conditions))
    .limit(1);
  return rows.length === 0;
}

export type ListAdminNewsParams = {
  q?: string;
  section?: Section | "none";
  status?: Status;
  includeDeleted?: boolean;
};

export async function listAdminNews(
  params: ListAdminNewsParams = {},
): Promise<(NewsRow & { photoCount: number })[]> {
  await requireSession();
  const database = requireDb();

  const conditions = [];
  if (params.q) {
    conditions.push(ilike(news.title, `%${params.q}%`));
  }
  if (params.section === "none") {
    conditions.push(isNull(news.section));
  } else if (params.section) {
    conditions.push(eq(news.section, params.section));
  }
  if (params.status) {
    conditions.push(eq(news.status, params.status));
  }
  if (!params.includeDeleted) {
    conditions.push(isNull(news.deletedAt));
  }

  const rows = await database
    .select()
    .from(news)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(news.publishedAt));

  const ids = rows.map((row) => row.id);
  const counts = ids.length
    ? await database
        .select({ newsId: newsPhoto.newsId, count: sql<number>`count(*)::int` })
        .from(newsPhoto)
        .where(inArray(newsPhoto.newsId, ids))
        .groupBy(newsPhoto.newsId)
    : [];
  const countByNewsId = new Map(counts.map((row) => [row.newsId, row.count]));

  return rows.map((row) => ({ ...row, photoCount: countByNewsId.get(row.id) ?? 0 }));
}

export async function getAdminNews(id: string): Promise<{ news: NewsRow; photos: NewsPhotoRow[] }> {
  await requireSession();
  const database = requireDb();

  const [row] = await database.select().from(news).where(eq(news.id, id)).limit(1);
  if (!row) {
    throw new Error(`Новость не найдена: ${id}`);
  }

  const photos = await database
    .select()
    .from(newsPhoto)
    .where(eq(newsPhoto.newsId, id))
    .orderBy(asc(newsPhoto.position));

  return { news: row, photos };
}

export type CreateNewsInput = {
  slug: string;
  title: string;
  publishedAt: string;
  excerpt?: string | null;
  body?: string | null;
  section?: Section | null;
  status?: Status;
  featured?: boolean;
  featuredOrder?: number | null;
  source?: string | null;
};

export async function createNews(input: CreateNewsInput): Promise<{ id: string; slug: string }> {
  await requireSession();
  const database = requireDb();

  const available = await isSlugAvailable(input.slug);
  if (!available) {
    throw new Error(`Slug уже используется: ${input.slug}`);
  }

  const values: typeof news.$inferInsert = {
    slug: input.slug,
    title: input.title,
    publishedAt: input.publishedAt,
    excerpt: input.excerpt ?? null,
    body: input.body ? sanitizeBody(input.body) : null,
    section: input.section ?? null,
    status: input.status ?? "draft",
    featured: input.featured ?? false,
    featuredOrder: input.featuredOrder ?? null,
    source: input.source ?? null,
  };

  try {
    const [row] = await database
      .insert(news)
      .values(values)
      .returning({ id: news.id, slug: news.slug });
    resetNewsCache();
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Slug уже используется: ${input.slug}`);
    }
    throw error;
  }
}

export type UpdateNewsInput = Partial<{
  slug: string;
  title: string;
  publishedAt: string;
  excerpt: string | null;
  body: string | null;
  section: Section | null;
  status: Status;
  featured: boolean;
  featuredOrder: number | null;
  source: string | null;
}>;

export async function updateNews(id: string, input: UpdateNewsInput): Promise<void> {
  await requireSession();
  const database = requireDb();

  if (input.slug !== undefined) {
    const available = await isSlugAvailable(input.slug, id);
    if (!available) {
      throw new Error(`Slug уже используется: ${input.slug}`);
    }
  }

  const values: Partial<typeof news.$inferInsert> = { ...input, updatedAt: new Date() };
  if (input.body !== undefined) {
    values.body = input.body ? sanitizeBody(input.body) : null;
  }

  try {
    await database.update(news).set(values).where(eq(news.id, id));
    resetNewsCache();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Slug уже используется: ${input.slug}`);
    }
    throw error;
  }
}

export async function softDeleteNews(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  await database.update(news).set({ deletedAt: new Date() }).where(eq(news.id, id));
  resetNewsCache();
}

export async function restoreNews(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  await database.update(news).set({ deletedAt: null }).where(eq(news.id, id));
  resetNewsCache();
}

/** Учитывает и мягко удалённые новости — их slug тоже занят. */
export async function checkSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
  await requireSession();
  return isSlugAvailable(slug, excludeId);
}

/**
 * `truncateSlug` из slug.ts сюда не подключается — зарезервирован под этап 8
 * (полный архив 2006–2025), см. src/server/slug.ts.
 */
export async function suggestSlug(title: string, publishedAt: string): Promise<string> {
  await requireSession();

  const base = slugify(title);
  if (await isSlugAvailable(base)) {
    return base;
  }

  // Тот же приём, что resolveSlugs в scripts/migrate-archive.ts — суффикс
  // датой в формате YYYY-MM-DD, чтобы новые slug не расходились с архивными.
  const withDate = `${base}-${publishedAt}`;
  if (await isSlugAvailable(withDate)) {
    return withDate;
  }

  let n = 2;
  while (!(await isSlugAvailable(`${base}-${n}`))) {
    n += 1;
  }
  return `${base}-${n}`;
}

export type AddPhotoInput = {
  newsId: string;
  key: string;
  alt?: string | null;
  position?: number;
};

export async function addPhoto(input: AddPhotoInput): Promise<NewsPhotoRow> {
  await requireSession();
  const database = requireDb();

  let position = input.position;
  if (position === undefined) {
    const [row] = await database
      .select({ maxPosition: sql<number | null>`max(${newsPhoto.position})` })
      .from(newsPhoto)
      .where(eq(newsPhoto.newsId, input.newsId));
    position = (row?.maxPosition ?? -1) + 1;
  }

  const [photo] = await database
    .insert(newsPhoto)
    .values({ newsId: input.newsId, s3Key: input.key, alt: input.alt ?? null, position })
    .returning();
  resetNewsCache();
  return photo;
}

export async function updatePhoto(id: string, input: { alt: string | null }): Promise<void> {
  await requireSession();
  const database = requireDb();
  await database.update(newsPhoto).set({ alt: input.alt }).where(eq(newsPhoto.id, id));
  resetNewsCache();
}

export async function deletePhoto(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  // news.cover_photo_id обнуляется автоматически FK ON DELETE SET NULL
  // (drizzle/0000_clumsy_namora.sql:74) — руками ничего обнулять не нужно.
  await database.delete(newsPhoto).where(eq(newsPhoto.id, id));
  resetNewsCache();
}

export async function reorderPhotos(newsId: string, orderedIds: string[]): Promise<void> {
  await requireSession();
  const database = requireDb();

  await database.transaction(async (tx) => {
    const existing = await tx
      .select({ id: newsPhoto.id })
      .from(newsPhoto)
      .where(eq(newsPhoto.newsId, newsId));
    const existingIds = new Set(existing.map((row) => row.id));
    const orderedIdSet = new Set(orderedIds);

    if (
      orderedIdSet.size !== orderedIds.length || // дубликаты в orderedIds
      existingIds.size !== orderedIdSet.size ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new Error("Список фото не совпадает с фото этой новости");
    }

    for (let index = 0; index < orderedIds.length; index++) {
      await tx
        .update(newsPhoto)
        .set({ position: index })
        .where(eq(newsPhoto.id, orderedIds[index]));
    }
  });

  resetNewsCache();
}

export async function setCoverPhoto(newsId: string, photoId: string): Promise<void> {
  await requireSession();
  const database = requireDb();

  const [photo] = await database
    .select({ id: newsPhoto.id })
    .from(newsPhoto)
    .where(and(eq(newsPhoto.id, photoId), eq(newsPhoto.newsId, newsId)))
    .limit(1);
  if (!photo) {
    throw new Error("Фото не принадлежит этой новости");
  }

  await database.update(news).set({ coverPhotoId: photoId }).where(eq(news.id, newsId));
  resetNewsCache();
}

export async function getNewsSlug(id: string): Promise<string> {
  await requireSession();
  const database = requireDb();
  const [row] = await database
    .select({ slug: news.slug })
    .from(news)
    .where(eq(news.id, id))
    .limit(1);
  if (!row) {
    throw new Error(`Новость не найдена: ${id}`);
  }
  return row.slug;
}

async function pickUniqueKey(slug: string, ext: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `news/${slug}/u${randomBytes(4).toString("hex")}.${ext}`;
    if (!(await objectExists(candidate))) {
      return candidate;
    }
  }
  throw new Error("Не удалось подобрать уникальный ключ файла");
}

export type UploadPhotoInput = { newsId: string; contentType: SupportedImageType; body: Buffer };

export async function uploadNewsPhoto(
  input: UploadPhotoInput,
): Promise<{ id: string; key: string; url: string }> {
  await requireSession();
  const slug = await getNewsSlug(input.newsId); // уже проверяет сессию и существование новости
  const ext = EXTENSION_BY_TYPE[input.contentType];
  const key = await pickUniqueKey(slug, ext);
  await uploadObject(key, input.body, input.contentType);

  let photo: NewsPhotoRow;
  try {
    photo = await addPhoto({ newsId: input.newsId, key });
  } catch (error) {
    // Объект уже залит в публичный бакет, а строка в БД не создалась — не
    // оставляем висячий файл, на который никто не ссылается.
    try {
      await deleteObject(key);
    } catch (cleanupError) {
      console.warn(
        `[news-admin] не удалось откатить объект S3 после сбоя addPhoto: ${key}`,
        cleanupError,
      );
    }
    throw error; // исходная ошибка, не подменяется ошибкой отката
  }

  return { id: photo.id, key, url: buildImageUrl(key) };
}

/** Фото этой новости с готовым URL — отдельно от `getAdminNews`, чтобы
 * галерея обновлялась независимым запросом, не задевая форму новости. */
export async function listNewsPhotos(newsId: string): Promise<(NewsPhotoRow & { url: string })[]> {
  await requireSession();
  const database = requireDb();
  const photos = await database
    .select()
    .from(newsPhoto)
    .where(eq(newsPhoto.newsId, newsId))
    .orderBy(asc(newsPhoto.position));
  return photos.map((p) => ({ ...p, url: buildImageUrl(p.s3Key) }));
}

export async function deletePhotoAndS3Object(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  const [row] = await database
    .select({ s3Key: newsPhoto.s3Key })
    .from(newsPhoto)
    .where(eq(newsPhoto.id, id))
    .limit(1);
  if (!row) {
    throw new Error("Фото не найдено");
  }
  await deletePhoto(id); // существующая функция, без изменений
  try {
    await deleteObject(row.s3Key); // существующая функция, без изменений
  } catch (error) {
    console.warn(`[news-admin] не удалось удалить объект S3: ${row.s3Key}`, error);
  }
}
