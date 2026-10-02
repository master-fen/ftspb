import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { news, newsPhoto } from "@/db/schema";
import { allNews, featuredNews, latestNews } from "@/data/mock";
import { isSmallCover } from "@/lib/card-cover";
import { formatFileSize } from "@/lib/format-file-size";
import { getFileExtension } from "@/lib/image-validation";
import { sortNewsByDateDesc } from "@/lib/news-date";
import { cardExcerpt, pageDescription } from "@/lib/news-excerpt";
import { clampPage, NEWS_PAGE_SIZE, pageCountFor } from "@/lib/news-paging";
import { isNewsId, type NewsPreviewState } from "@/lib/news-preview";
import { pickRelatedNews } from "@/lib/news-related";
import { NEWS_SECTIONS, SECTION_LABELS, type NewsSectionCategory } from "@/lib/section-category";
import type { NewsCardItem, NewsCategory, NewsItem, NewsSection } from "@/lib/types/news";
import { getCurrentSession } from "@/server/auth";
import { getPublishedDocumentsForNews } from "@/server/documents";
import { getNewsCache, setNewsCache, type NewsCache } from "@/server/news-cache";
import { decideShareAccess } from "@/server/news-share-link";
import { buildImageUrl } from "@/server/storage";

const CACHE_TTL_MS = 60_000;

/** Страница ленты: карточки страницы, общее число записей в фильтре и число страниц. */
export type NewsListPage = {
  items: NewsCardItem[];
  total: number;
  pageCount: number;
  /** Номер отданной страницы — после приведения в диапазон (`clampPage`), не `?page=` из адреса. */
  page: number;
};

/** Страница новости одним вызовом: новость, «Читайте также» и описание для head. */
export type NewsArticle = {
  item: NewsItem;
  related: NewsCardItem[];
  /** `pageDescription` по правилу анонса (порог 200), при пустом источнике — заголовок. */
  description: string;
};

/**
 * Ответ предпросмотра. `unauthorized` и `link-invalid` не несут ничего, кроме
 * вида ответа: они попадают в данные лоадера и в SSR-разметку заглушки.
 * `redirect` — опубликованная новость по годной ссылке согласования, лоадер
 * перенаправляет на публичный адрес. `shared` — черновик по годной ссылке.
 */
export type NewsPreview =
  | { kind: "not-found" }
  | { kind: "unauthorized" }
  | { kind: "link-invalid" }
  | { kind: "redirect"; slug: string }
  | { kind: "ok"; newsId: string; state: NewsPreviewState; article: NewsArticle }
  | { kind: "shared"; newsId: string; expiresOn: string; article: NewsArticle };

function sectionToCategory(section: NewsSection | null): NewsCategory {
  return section === null ? "Общее" : SECTION_LABELS[section];
}

/**
 * Обратное к `sectionToCategory`. Нужно только мок-пути (`db === null`):
 * у фикстур `src/data/news-archive.ts` есть лишь `category`, а фильтры
 * сравнивают `section` — восстанавливаем его в момент отдачи, файлы данных не трогая.
 */
function categoryToSection(category: NewsCategory): NewsSection | null {
  return NEWS_SECTIONS.find((section) => SECTION_LABELS[section] === category) ?? null;
}

function withSection(item: NewsItem): NewsItem {
  return { ...item, section: categoryToSection(item.category) };
}

/** Карточка из мок-фикстуры: раздел из `category`, анонс — по правилу карточки, как в кэше. */
function toCardItem(item: NewsItem): NewsCardItem {
  return {
    id: item.id,
    category: item.category,
    section: categoryToSection(item.category),
    date: item.date,
    title: item.title,
    excerpt: cardExcerpt(item.excerpt, item.body) || undefined,
    cover: item.cover,
    featured: item.featured ?? false,
    updatedAtIso: item.updatedAtIso,
  };
}

/** `published_at` приходит из drizzle как строка `YYYY-MM-DD` → вид `dd.mm.yy`, который уже парсит news-date.ts. */
function isoDateToShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

/**
 * Обложка новости среди её фото (`photos` уже отсортированы по position).
 * Фолбэк на первое фото — на текущих данных не выполняется ни разу: у всех
 * новостей с фото coverPhotoId заполнен и указывает на верную строку. Это
 * состояние, которого после этапа 5 быть не должно — админка обязана всегда
 * проставлять обложку. Не молчим: если сработало, значит где-то разошлись
 * данные, это стоит заметить в логах.
 */
function resolveCover<P extends { id: string }>(
  slug: string,
  coverPhotoId: string | null,
  photos: readonly P[],
): P | undefined {
  let cover = coverPhotoId ? photos.find((photo) => photo.id === coverPhotoId) : undefined;
  if (!cover && photos.length > 0) {
    console.warn(
      `[news] coverPhotoId пуст или не найден среди фото новости, фолбэк на минимальный position: ${slug}`,
    );
    cover = photos[0];
  }
  return cover;
}

async function loadCache(): Promise<NewsCache> {
  const now = Date.now();
  const existing = getNewsCache();
  if (existing && existing.expiresAt > now) {
    return existing;
  }

  if (db === null) {
    throw new Error("loadCache() вызван без БД — обрабатывать через fallback на mock");
  }

  // Публичная функция, сессии нет — колонки перечислены явно, как в
  // listPublishedPersons: при `.select()` без списка любая новая колонка
  // (source, status, created_at/updated_at, deleted_at…) автоматически
  // попадала бы в кэш и дальше в SSR/loaderData. Наружу — только то, что
  // рисуют карточки.
  //
  // `body` читается только ради правила анонса (`cardExcerpt`: свой анонс,
  // иначе начало тела) и в кэш не попадает — карточке тело не нужно, а
  // лоадер ленты отдавал бы его в SSR-разметку и loaderData каждого
  // открытия. Цена — чтение тел всех опубликованных новостей раз в
  // CACHE_TTL_MS при перестройке кэша.
  const newsRows = await db
    .select({
      id: news.id,
      slug: news.slug,
      title: news.title,
      excerpt: news.excerpt,
      body: news.body,
      section: news.section,
      publishedAt: news.publishedAt,
      featured: news.featured,
      featuredOrder: news.featuredOrder,
      coverPhotoId: news.coverPhotoId,
      updatedAt: news.updatedAt,
    })
    .from(news)
    .where(and(eq(news.status, "published"), isNull(news.deletedAt)))
    // Второй и третий ключ — детерминированные границы страниц: в архиве
    // много новостей с одной датой, а без tiebreaker порядок внутри дня не
    // задан, и после перестройки кэша новость могла бы оказаться на двух
    // страницах или ни на одной.
    .orderBy(desc(news.publishedAt), desc(news.createdAt), desc(news.id));

  const newsIds = newsRows.map((row) => row.id);

  // Из фото карточке нужна только обложка; галерею читает деталка (getNewsBySlug).
  // width/height — ради правила «маленькая обложка» (isSmallCover); наружу
  // уезжает не размер, а готовый признак coverSmall.
  const photoRows = newsIds.length
    ? await db
        .select({
          id: newsPhoto.id,
          newsId: newsPhoto.newsId,
          s3Key: newsPhoto.s3Key,
          width: newsPhoto.width,
          height: newsPhoto.height,
        })
        .from(newsPhoto)
        .where(inArray(newsPhoto.newsId, newsIds))
        .orderBy(newsPhoto.position)
    : [];

  const photosByNewsId = new Map<string, typeof photoRows>();
  for (const photo of photoRows) {
    const arr = photosByNewsId.get(photo.newsId) ?? [];
    arr.push(photo);
    photosByNewsId.set(photo.newsId, arr);
  }

  const featuredOrderById = new Map<string, number>();

  const items: NewsCardItem[] = newsRows.map((row) => {
    const coverPhoto = resolveCover(row.slug, row.coverPhotoId, photosByNewsId.get(row.id) ?? []);

    if (row.featured) {
      featuredOrderById.set(row.slug, row.featuredOrder ?? Number.MAX_SAFE_INTEGER);
    }

    return {
      id: row.slug,
      category: sectionToCategory(row.section),
      section: row.section,
      date: isoDateToShort(row.publishedAt),
      title: row.title,
      excerpt: cardExcerpt(row.excerpt, row.body) || undefined,
      cover: coverPhoto ? buildImageUrl(coverPhoto.s3Key) : undefined,
      featured: row.featured,
      updatedAtIso: row.updatedAt.toISOString(),
      // Ключ появляется только у маленькой обложки: см. NewsCardItem.coverSmall.
      ...(isSmallCover(coverPhoto?.width, coverPhoto?.height) ? { coverSmall: true as const } : {}),
    };
  });

  const next: NewsCache = {
    items,
    featuredOrderById,
    expiresAt: now + CACHE_TTL_MS,
  };
  setNewsCache(next);
  return next;
}

/** Карточки всех опубликованных новостей, новые сверху: карта сайта и «Читайте также». */
export async function listNews(): Promise<NewsCardItem[]> {
  if (db === null) {
    return sortNewsByDateDesc(allNews.map(toCardItem));
  }
  const { items } = await loadCache();
  return items;
}

function matchesCategory(item: NewsCardItem, category: NewsSectionCategory): boolean {
  if (category === "all") return true;
  // Сравниваем машинный раздел, а не русскую подпись category.
  // «Общее» — новости без раздела (section === null).
  const wanted: NewsSection | null = category === "general" ? null : category;
  return (item.section ?? null) === wanted;
}

/**
 * Страница ленты: фильтр по разделу, `NEWS_PAGE_SIZE` карточек; номер вне
 * диапазона — первая страница (мусор в `?page=` до сюда не доходит — его
 * снимает схема поиска маршрута).
 */
export async function listNewsPage(input: {
  page: number;
  category: NewsSectionCategory;
}): Promise<NewsListPage> {
  const all = await listNews();
  const filtered = all.filter((item) => matchesCategory(item, input.category));
  const total = filtered.length;
  const pageCount = pageCountFor(total);
  const page = clampPage(input.page, pageCount);
  const start = (page - 1) * NEWS_PAGE_SIZE;
  return { items: filtered.slice(start, start + NEWS_PAGE_SIZE), total, pageCount, page };
}

/**
 * Колонки новости для её страницы — одни на публичную страницу и на
 * предпросмотр. Публичная функция, сессии нет — список явный, как в
 * `loadCache`: новая колонка не уедет в данные лоадера сама.
 */
const NEWS_ITEM_COLUMNS = {
  id: news.id,
  slug: news.slug,
  title: news.title,
  excerpt: news.excerpt,
  body: news.body,
  section: news.section,
  publishedAt: news.publishedAt,
  featured: news.featured,
  coverPhotoId: news.coverPhotoId,
  videoUrl: news.videoUrl,
  hideCoverOnPage: news.hideCoverOnPage,
  updatedAt: news.updatedAt,
};

type NewsItemRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  section: NewsSection | null;
  publishedAt: string;
  featured: boolean;
  coverPhotoId: string | null;
  videoUrl: string | null;
  hideCoverOnPage: boolean;
  updatedAt: Date;
};

/**
 * Новость для своей страницы — отдельный запрос по слагу: тело, видео,
 * галерея и документы. Кэш списка не поднимается, своего кэша у деталки нет.
 */
export async function getNewsBySlug(slug: string): Promise<NewsItem | null> {
  if (db === null) {
    const found = allNews.find((item) => item.id === slug);
    return found ? withSection(found) : null;
  }

  const rows = await db
    .select(NEWS_ITEM_COLUMNS)
    .from(news)
    .where(and(eq(news.slug, slug), eq(news.status, "published"), isNull(news.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  return toNewsItem(row);
}

/**
 * Сборка `NewsItem` из строки новости — одна на публичную страницу и на
 * предпросмотр. Вложения — по публичному правилу (опубликованные, не
 * удалённые документы): предпросмотр показывает то, что увидит посетитель.
 */
async function toNewsItem(row: NewsItemRow): Promise<NewsItem> {
  if (db === null) {
    throw new Error("toNewsItem() вызван без БД");
  }
  const [photos, docs] = await Promise.all([
    db
      .select({ id: newsPhoto.id, s3Key: newsPhoto.s3Key })
      .from(newsPhoto)
      .where(eq(newsPhoto.newsId, row.id))
      .orderBy(newsPhoto.position),
    getPublishedDocumentsForNews(row.id),
  ]);

  const coverPhoto = resolveCover(row.slug, row.coverPhotoId, photos);
  const gallery = photos
    .filter((photo) => photo.id !== coverPhoto?.id)
    .map((photo) => buildImageUrl(photo.s3Key));

  return {
    id: row.slug,
    category: sectionToCategory(row.section),
    section: row.section,
    date: isoDateToShort(row.publishedAt),
    title: row.title,
    excerpt: row.excerpt ?? undefined,
    body: row.body ?? undefined,
    attachments: docs.length
      ? docs.map((doc) => ({
          kind: getFileExtension(doc.fileName).toUpperCase(),
          title: doc.title,
          size: formatFileSize(doc.sizeBytes),
          url: doc.url,
        }))
      : undefined,
    cover: coverPhoto ? buildImageUrl(coverPhoto.s3Key) : undefined,
    gallery: gallery.length ? gallery : undefined,
    featured: row.featured,
    // Значение колонки как есть (null, если видео нет).
    videoUrl: row.videoUrl,
    hideCoverOnPage: row.hideCoverOnPage,
    publishedAtIso: row.publishedAt,
    updatedAtIso: row.updatedAt.toISOString(),
  };
}

/**
 * «Читайте также» обложку не рисует вовсе (`RelatedItem` — строка «категория ·
 * дата» и заголовок), поэтому признак маленькой обложки в данные страницы
 * новости не уезжает: поле там мёртвое, а данные лоадера попадают в
 * SSR-разметку. Копия, а не `delete` по месту: объекты карточек общие — они
 * лежат в кэше и раздаются всем запросам.
 */
function withoutCoverSmall(item: NewsCardItem): NewsCardItem {
  if (!item.coverSmall) return item;
  const copy = { ...item };
  delete copy.coverSmall;
  return copy;
}

/**
 * Страница новости одним вызовом: лоадер деталки не переносит список
 * карточек на клиент — «Читайте также» подбирается здесь из кэша карточек.
 */
export async function getNewsArticle(slug: string): Promise<NewsArticle | null> {
  const item = await getNewsBySlug(slug);
  if (!item) {
    return null;
  }
  return toArticle(item);
}

/** «Читайте также» и описание к новости — одни на публичную страницу и на предпросмотр. */
async function toArticle(item: NewsItem): Promise<NewsArticle> {
  const related = pickRelatedNews(await listNews(), item).map(withoutCoverSmall);
  return { item, related, description: pageDescription(item.excerpt, item.body) || item.title };
}

/**
 * Предпросмотр новости редактором (`/news/preview/ID`): та же сборка, что у
 * публичной страницы, но без фильтра статуса и удаления.
 *
 * Порядок проверок — граница доступа, guard админки навигационный (CLAUDE.md):
 * - без БД (`DATABASE_URL` пуст) — «не найдена»: мок-фикстур черновиков нет,
 *   а `getCurrentSession` без БД бросает;
 * - ID не в форме uuid — «не найдена» до любых запросов (колонка uuid,
 *   мусор уронил бы запрос в 500); форма видна из адреса и ничего не раскрывает;
 * - есть сессия — вид редактора, ключ из адреса не читается; новости нет —
 *   «не найдена»;
 * - нет сессии и нет ключа — `unauthorized`, и ни одного запроса к `news`:
 *   анонимный посетитель не узнаёт даже, есть ли новость с таким id;
 * - нет сессии, есть ключ — ссылка согласования: строка читается только по
 *   id из адреса, решение — `decideShareAccess` (src/server/news-share-link.ts).
 *   Любая неудача — одна и та же `link-invalid`, без данных новости.
 *
 * Новость без фильтра статуса читается только здесь, после проверки сессии
 * или ключа; `toNewsItem` и колонки не экспортируются.
 */
export async function getNewsPreview(input: { id: string; key?: string }): Promise<NewsPreview> {
  const { id, key } = input;
  if (db === null || !isNewsId(id)) {
    return { kind: "not-found" };
  }
  const session = await getCurrentSession();
  if (session) {
    const rows = await db
      .select({ ...NEWS_ITEM_COLUMNS, status: news.status, deletedAt: news.deletedAt })
      .from(news)
      .where(eq(news.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return { kind: "not-found" };
    }
    const { status, deletedAt, ...itemRow } = row;
    const state: NewsPreviewState = deletedAt ? "deleted" : status;
    return {
      kind: "ok",
      newsId: row.id,
      state,
      article: await toArticle(await toNewsItem(itemRow)),
    };
  }
  if (key === undefined) {
    return { kind: "unauthorized" };
  }
  const rows = await db
    .select({
      ...NEWS_ITEM_COLUMNS,
      status: news.status,
      deletedAt: news.deletedAt,
      previewToken: news.previewToken,
      previewTokenExpiresAt: news.previewTokenExpiresAt,
    })
    .from(news)
    .where(eq(news.id, id))
    .limit(1);
  const row = rows[0];
  const access = decideShareAccess(row ?? null, key, new Date());
  if (!row || access.kind === "invalid") {
    return { kind: "link-invalid" };
  }
  if (access.kind === "redirect") {
    return { kind: "redirect", slug: row.slug };
  }
  const { status, deletedAt, previewToken, previewTokenExpiresAt, ...itemRow } = row;
  return {
    kind: "shared",
    newsId: row.id,
    expiresOn: access.expiresOn,
    article: await toArticle(await toNewsItem(itemRow)),
  };
}

export async function getFeaturedAndLatest(): Promise<{
  featured: NewsCardItem[];
  latest: NewsCardItem[];
}> {
  if (db === null) {
    return { featured: featuredNews.map(toCardItem), latest: latestNews.map(toCardItem) };
  }
  const { items, featuredOrderById } = await loadCache();
  const featured = items
    .filter((item) => item.featured)
    .sort((a, b) => (featuredOrderById.get(a.id) ?? 0) - (featuredOrderById.get(b.id) ?? 0))
    .slice(0, 3);
  const latest = items.filter((item) => !item.featured).slice(0, 6);
  return { featured, latest };
}
