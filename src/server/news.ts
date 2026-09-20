import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { news, newsPhoto } from "@/db/schema";
import { allNews, featuredNews, latestNews } from "@/data/mock";
import { formatFileSize } from "@/lib/format-file-size";
import { getFileExtension } from "@/lib/image-validation";
import { sortNewsByDateDesc } from "@/lib/news-date";
import { cardExcerpt, pageDescription } from "@/lib/news-excerpt";
import { clampPage, NEWS_PAGE_SIZE, pageCountFor } from "@/lib/news-paging";
import { pickRelatedNews } from "@/lib/news-related";
import type { SectionCategory } from "@/lib/section-category";
import type { NewsCardItem, NewsCategory, NewsItem, NewsSection } from "@/lib/types/news";
import { getPublishedDocumentsForNews } from "@/server/documents";
import { getNewsCache, setNewsCache, type NewsCache } from "@/server/news-cache";
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

function sectionToCategory(section: NewsSection | null): NewsCategory {
  switch (section) {
    case "federation":
      return "Федерация";
    case "referees":
      return "Коллегия судей";
    case null:
      return "Общее";
  }
}

/**
 * Обратное к `sectionToCategory`. Нужно только мок-пути (`db === null`):
 * у фикстур `src/data/news-archive.ts` есть лишь `category`, а фильтры
 * сравнивают `section` — восстанавливаем его в момент отдачи, файлы данных не трогая.
 */
function categoryToSection(category: NewsCategory): NewsSection | null {
  switch (category) {
    case "Федерация":
      return "federation";
    case "Коллегия судей":
      return "referees";
    case "Общее":
      return null;
  }
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
  const photoRows = newsIds.length
    ? await db
        .select({ id: newsPhoto.id, newsId: newsPhoto.newsId, s3Key: newsPhoto.s3Key })
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

function matchesCategory(item: NewsCardItem, category: SectionCategory): boolean {
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
  category: SectionCategory;
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
 * Новость для своей страницы — отдельный запрос по слагу: тело, видео,
 * галерея и документы. Кэш списка не поднимается, своего кэша у деталки нет.
 */
export async function getNewsBySlug(slug: string): Promise<NewsItem | null> {
  if (db === null) {
    const found = allNews.find((item) => item.id === slug);
    return found ? withSection(found) : null;
  }

  const rows = await db
    .select({
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
    })
    .from(news)
    .where(and(eq(news.slug, slug), eq(news.status, "published"), isNull(news.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
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
 * Страница новости одним вызовом: лоадер деталки не переносит список
 * карточек на клиент — «Читайте также» подбирается здесь из кэша карточек.
 */
export async function getNewsArticle(slug: string): Promise<NewsArticle | null> {
  const item = await getNewsBySlug(slug);
  if (!item) {
    return null;
  }
  const related = pickRelatedNews(await listNews(), item);
  return { item, related, description: pageDescription(item.excerpt, item.body) || item.title };
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
