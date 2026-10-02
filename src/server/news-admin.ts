import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { ADMIN_PAGE_SIZE, clampPageToLast } from "@/lib/admin-list-paging";
import { db } from "@/db/client";
import { news, newsPhoto } from "@/db/schema";
import { HttpError } from "@/lib/http-error";
import { EXTENSION_BY_TYPE, type SupportedImageType } from "@/lib/image-validation";
import { pageCountFor } from "@/lib/news-paging";
import { isNewsId } from "@/lib/news-preview";
import { normalizeVideoUrl } from "@/lib/news-video-url";
import { parsePhotoSize } from "@/lib/photo-dimensions";
import { matchesQuery, visibleText } from "@/lib/search-text";
import type { NewsSection } from "@/lib/section-category";
import { requireSession } from "@/server/auth";
import { resetNewsCache } from "@/server/news-cache";
import {
  newShareToken,
  shareExpiresAt,
  shareLinkState,
  type ShareLinkState,
} from "@/server/news-share-link";
import { resetSearchIndex } from "@/server/search-index";
import { sanitizeBody } from "@/server/sanitize";
import { slugify } from "@/server/slug";
import { buildImageUrl, deleteObject, objectExists, uploadObject } from "@/server/storage";

type NewsRow = typeof news.$inferSelect;
type NewsPhotoRow = typeof newsPhoto.$inferSelect;
type Section = NewsSection;
type Status = "draft" | "published";

function requireDb(): NonNullable<typeof db> {
  if (db === null) {
    throw new Error("Требуется БД (DATABASE_URL не задан), а для админки мок-фолбэка нет");
  }
  return db;
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
  /** Уже обрезан и не пуст — нормализация (`normalizeSearchQuery`) на границе HTTP, в news-admin-server-fn.ts. */
  q?: string;
  section?: Section | "none";
  status?: Status;
  includeDeleted?: boolean;
  year?: number;
  source?: "archive" | "manual";
  page: number;
};

/** Строка списка `/admin/news` — без `excerpt`/`body`: тяжёлые текстовые поля нужны только для поиска, на клиент не уходят. */
export type AdminNewsListRow = Pick<
  NewsRow,
  | "id"
  | "slug"
  | "title"
  | "publishedAt"
  | "section"
  | "status"
  | "featured"
  | "deletedAt"
  | "source"
>;

export type AdminNewsListPage = {
  items: (AdminNewsListRow & { photoCount: number })[];
  total: number;
  pageCount: number;
  /** Номер отданной страницы после `clampPageToLast` — не обязательно `params.page`. */
  page: number;
};

const ADMIN_NEWS_LIST_COLUMNS = {
  id: news.id,
  slug: news.slug,
  title: news.title,
  publishedAt: news.publishedAt,
  section: news.section,
  status: news.status,
  featured: news.featured,
  deletedAt: news.deletedAt,
  source: news.source,
};

/**
 * Поиск — не SQL `ILIKE`: регистронезависимость кириллицы не должна
 * зависеть от локали подключения (`ILIKE`/`lower()` в Postgres читают
 * `lc_ctype`, а локаль боевой базы неизвестна), поэтому сравнение — в JS
 * (`matchesQuery`, `src/lib/search-text.ts`) по видимому тексту
 * (`visibleText` — снимает теги и их атрибуты, декодирует сущности).
 * `excerpt`/`body` довыбираются только когда есть `q` — тяжёлые текстовые
 * поля незачем таскать, когда фильтра по тексту нет. Тай-брейк сортировки
 * (`createdAt`, `id`) — тот же приём, что у публичной ленты
 * (`docs/decisions.md`): без него одна новость при равной `publishedAt`
 * может оказаться на двух страницах или ни на одной.
 */
export async function listAdminNews(params: ListAdminNewsParams): Promise<AdminNewsListPage> {
  await requireSession();
  const database = requireDb();

  const conditions = [];
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
  if (params.source === "archive") {
    conditions.push(isNotNull(news.source));
  } else if (params.source === "manual") {
    conditions.push(isNull(news.source));
  }
  if (params.year) {
    conditions.push(gte(news.publishedAt, `${params.year}-01-01`));
    conditions.push(lt(news.publishedAt, `${params.year + 1}-01-01`));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const orderBy = [desc(news.publishedAt), desc(news.createdAt), desc(news.id)] as const;

  const q = params.q;
  const filteredRows: AdminNewsListRow[] = q
    ? (
        await database
          .select({ ...ADMIN_NEWS_LIST_COLUMNS, excerpt: news.excerpt, body: news.body })
          .from(news)
          .where(where)
          .orderBy(...orderBy)
      ).filter((row) =>
        matchesQuery(
          `${visibleText(row.title)} ${visibleText(row.excerpt)} ${visibleText(row.body)}`,
          q,
        ),
      )
    : await database
        .select(ADMIN_NEWS_LIST_COLUMNS)
        .from(news)
        .where(where)
        .orderBy(...orderBy);

  const total = filteredRows.length;
  const pageCount = pageCountFor(total, ADMIN_PAGE_SIZE);
  const page = clampPageToLast(params.page, pageCount);
  const start = (page - 1) * ADMIN_PAGE_SIZE;
  const pageRows = filteredRows.slice(start, start + ADMIN_PAGE_SIZE);

  const ids = pageRows.map((row) => row.id);
  const counts = ids.length
    ? await database
        .select({ newsId: newsPhoto.newsId, count: sql<number>`count(*)::int` })
        .from(newsPhoto)
        .where(inArray(newsPhoto.newsId, ids))
        .groupBy(newsPhoto.newsId)
    : [];
  const countByNewsId = new Map(counts.map((row) => [row.newsId, row.count]));

  const items = pageRows.map((row) => ({ ...row, photoCount: countByNewsId.get(row.id) ?? 0 }));

  return { items, total, pageCount, page };
}

/** Годы публикации новостей по убыванию, без повторов — независимо от
 * остальных фильтров (иначе список лет прыгал бы при вводе запроса). */
export async function listAdminNewsYears(): Promise<number[]> {
  await requireSession();
  const database = requireDb();
  const year = sql<number>`extract(year from ${news.publishedAt})::int`;
  const rows = await database.selectDistinct({ year }).from(news).orderBy(desc(year));
  return rows.map((row) => row.year);
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

/**
 * Ссылка на видео для записи в БД: undefined/null/пустая строка → null,
 * иначе — нормализованный embed-адрес или ошибка валидатора. Форма
 * проверяет то же самое, но эндпоинт вызывается по HTTP напрямую
 * (CLAUDE.md), поэтому сырое значение в таблицу не попадает никогда.
 */
function videoUrlForStorage(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }
  const result = normalizeVideoUrl(value);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.url;
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
  videoUrl?: string | null;
  hideCoverOnPage?: boolean;
  /** Событие Федерации, к которому относится новость; null — «Нет». */
  eventId?: string | null;
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
    videoUrl: videoUrlForStorage(input.videoUrl),
    hideCoverOnPage: input.hideCoverOnPage ?? false,
    eventId: input.eventId ?? null,
  };

  try {
    const [row] = await database
      .insert(news)
      .values(values)
      .returning({ id: news.id, slug: news.slug });
    resetNewsCache();
    resetSearchIndex();
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
  videoUrl: string | null;
  hideCoverOnPage: boolean;
  eventId: string | null;
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
  if (input.videoUrl !== undefined) {
    values.videoUrl = videoUrlForStorage(input.videoUrl);
  }

  try {
    await database.update(news).set(values).where(eq(news.id, id));
    resetNewsCache();
    resetSearchIndex();
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
  resetSearchIndex();
}

export async function restoreNews(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  await database.update(news).set({ deletedAt: null }).where(eq(news.id, id));
  resetNewsCache();
  resetSearchIndex();
}

/** Мусор вместо uuid уронил бы запрос ошибкой Postgres — отказ до запроса. */
function requireNewsId(id: string): void {
  if (!isNewsId(id)) {
    throw new Error(`Неверный id новости: ${id}`);
  }
}

/**
 * Ссылка на черновик для согласования (src/server/news-share-link.ts):
 * состояние для блока «Согласование» в редакторе. Истёкшая ссылка токен
 * не отдаёт — для редактора это то же, что «нет ссылки».
 */
export async function getNewsShareLink(id: string): Promise<ShareLinkState> {
  await requireSession();
  const database = requireDb();
  requireNewsId(id);
  const [row] = await database
    .select({ token: news.previewToken, expiresAt: news.previewTokenExpiresAt })
    .from(news)
    .where(eq(news.id, id))
    .limit(1);
  if (!row) {
    throw new Error(`Новость не найдена: ${id}`);
  }
  return shareLinkState(row.token, row.expiresAt, new Date());
}

/**
 * Новая ссылка на 14 суток; прежняя, если была, сразу перестаёт работать.
 * Только у черновика, не удалённого — условие в самом UPDATE, а не проверкой
 * до него. Статус и `updated_at` не трогаются: ссылка — не правка новости
 * (`updated_at` идёт в lastmod карты сайта и `article:modified_time`), и
 * кэши не сбрасываются — токена в них нет.
 */
export async function createNewsShareLink(id: string): Promise<ShareLinkState> {
  await requireSession();
  const database = requireDb();
  requireNewsId(id);
  const now = new Date();
  const token = newShareToken();
  const expiresAt = shareExpiresAt(now);
  const rows = await database
    .update(news)
    .set({ previewToken: token, previewTokenExpiresAt: expiresAt })
    .where(and(eq(news.id, id), eq(news.status, "draft"), isNull(news.deletedAt)))
    .returning({ id: news.id });
  if (rows.length === 0) {
    throw new Error("Ссылку можно создать только для черновика");
  }
  return shareLinkState(token, expiresAt, now);
}

/** Отзыв ссылки: токен и срок стираются, старая ссылка даёт заглушку. */
export async function revokeNewsShareLink(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  requireNewsId(id);
  await database
    .update(news)
    .set({ previewToken: null, previewTokenExpiresAt: null })
    .where(eq(news.id, id));
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
  /** Уже проверенная пара сторон (`parsePhotoSize`) или ничего. */
  size?: { width: number; height: number } | null;
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
    .values({
      newsId: input.newsId,
      s3Key: input.key,
      alt: input.alt ?? null,
      position,
      width: input.size?.width ?? null,
      height: input.size?.height ?? null,
    })
    .returning();
  resetNewsCache();
  resetSearchIndex();
  return photo;
}

export async function updatePhoto(id: string, input: { alt: string | null }): Promise<void> {
  await requireSession();
  const database = requireDb();
  await database.update(newsPhoto).set({ alt: input.alt }).where(eq(newsPhoto.id, id));
  resetNewsCache();
  resetSearchIndex();
}

export async function deletePhoto(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  // news.cover_photo_id обнуляется автоматически FK ON DELETE SET NULL
  // (drizzle/0000_clumsy_namora.sql:74) — руками ничего обнулять не нужно.
  await database.delete(newsPhoto).where(eq(newsPhoto.id, id));
  resetNewsCache();
  resetSearchIndex();
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
  resetSearchIndex();
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
  resetSearchIndex();
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
    throw new HttpError(404, `Новость не найдена: ${id}`);
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

export type UploadPhotoInput = {
  newsId: string;
  contentType: SupportedImageType;
  body: Buffer;
  /**
   * Сырые поля формы: браузер меряет тот файл, который уедет в хранилище
   * (после сжатия). Проверяет их здесь `parsePhotoSize` — так же, как
   * `videoUrlForStorage` приводит адрес видео: эндпоинт зовут по HTTP
   * напрямую, и непроверенное значение в таблицу попасть не должно.
   * Некорректное — строка пишется без размеров, загрузка не падает.
   */
  width?: unknown;
  height?: unknown;
};

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
    photo = await addPhoto({
      newsId: input.newsId,
      key,
      size: parsePhotoSize(input.width, input.height),
    });
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
