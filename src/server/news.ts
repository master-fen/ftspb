import process from "node:process";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { document, news, newsDocument, newsPhoto } from "@/db/schema";
import { allNews, featuredNews, latestNews } from "@/data/mock";
import type { NewsAttachment, NewsCategory, NewsItem } from "@/lib/types/news";

const CACHE_TTL_MS = 60_000;

type Cache = {
  items: NewsItem[];
  featuredOrderById: Map<string, number>;
  expiresAt: number;
};

let cache: Cache | null = null;

/** `S3_ENDPOINT`/`S3_BUCKET` заданы всегда вместе с `DATABASE_URL` — иначе БД недостижима. */
export function buildImageUrl(s3Key: string): string {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket) {
    throw new Error("Не заданы переменные окружения: S3_ENDPOINT, S3_BUCKET");
  }
  return `${endpoint}/${bucket}/${s3Key}`;
}

function sectionToCategory(section: "federation" | "referees" | null): NewsCategory {
  switch (section) {
    case "federation":
      return "Федерация";
    case "referees":
      return "Коллегия судей";
    case null:
      return "Общее";
  }
}

/** `published_at` приходит из drizzle как строка `YYYY-MM-DD` → вид `dd.mm.yy`, который уже парсит news.index.tsx. */
function isoDateToShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

function mimeToKind(mimeType: string): NewsAttachment["kind"] {
  switch (mimeType) {
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "DOC";
    case "application/vnd.ms-excel":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "XLS";
    default:
      return "PDF";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} КБ`;
  return `${(kb / 1024).toFixed(1)} МБ`;
}

async function loadCache(): Promise<Cache> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache;
  }

  if (db === null) {
    throw new Error("loadCache() вызван без БД — обрабатывать через fallback на mock");
  }

  const newsRows = await db
    .select()
    .from(news)
    .where(and(eq(news.status, "published"), isNull(news.deletedAt)))
    .orderBy(desc(news.publishedAt));

  const newsIds = newsRows.map((row) => row.id);

  const photoRows = newsIds.length
    ? await db
        .select()
        .from(newsPhoto)
        .where(inArray(newsPhoto.newsId, newsIds))
        .orderBy(newsPhoto.position)
    : [];

  const docRows = newsIds.length
    ? await db
        .select({
          newsId: newsDocument.newsId,
          position: newsDocument.position,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
        })
        .from(newsDocument)
        .innerJoin(document, eq(newsDocument.documentId, document.id))
        .where(inArray(newsDocument.newsId, newsIds))
        .orderBy(newsDocument.position)
    : [];

  const photosByNewsId = new Map<string, typeof photoRows>();
  for (const photo of photoRows) {
    const arr = photosByNewsId.get(photo.newsId) ?? [];
    arr.push(photo);
    photosByNewsId.set(photo.newsId, arr);
  }

  const docsByNewsId = new Map<string, typeof docRows>();
  for (const row of docRows) {
    const arr = docsByNewsId.get(row.newsId) ?? [];
    arr.push(row);
    docsByNewsId.set(row.newsId, arr);
  }

  const featuredOrderById = new Map<string, number>();

  const items: NewsItem[] = newsRows.map((row) => {
    const photos = photosByNewsId.get(row.id) ?? [];
    const docs = docsByNewsId.get(row.id) ?? [];

    // Фолбэк на photos[0] (минимальный position, photos уже отсортирован
    // запросом выше) — на текущих данных не выполняется ни разу: у всех
    // новостей с фото coverPhotoId заполнен и указывает на верную строку.
    // Это состояние, которого после этапа 5 быть не должно — админка
    // обязана всегда проставлять обложку. Не молчим: если сработало,
    // значит где-то разошлись данные, это стоит заметить в логах.
    let coverPhoto = row.coverPhotoId
      ? photos.find((photo) => photo.id === row.coverPhotoId)
      : undefined;
    if (!coverPhoto && photos.length > 0) {
      console.warn(
        `[news] coverPhotoId пуст или не найден среди фото новости, фолбэк на минимальный position: ${row.slug}`,
      );
      coverPhoto = photos[0];
    }
    const gallery = photos
      .filter((photo) => photo.id !== coverPhoto?.id)
      .map((photo) => buildImageUrl(photo.s3Key));

    if (row.featured) {
      featuredOrderById.set(row.slug, row.featuredOrder ?? Number.MAX_SAFE_INTEGER);
    }

    return {
      id: row.slug,
      category: sectionToCategory(row.section),
      date: isoDateToShort(row.publishedAt),
      title: row.title,
      excerpt: row.excerpt ?? undefined,
      body: row.body ?? undefined,
      // Заглушка вместо document.title (= заголовок новости, оригинальное имя файла в БД
      // не сохранено) — до рендера со ссылкой на S3 на этапе 6.
      attachments: docs.length
        ? docs.map((docRow, i) => ({
            kind: mimeToKind(docRow.mimeType),
            title: `Документ ${i + 1}`,
            size: formatBytes(docRow.sizeBytes),
          }))
        : undefined,
      cover: coverPhoto ? buildImageUrl(coverPhoto.s3Key) : undefined,
      gallery: gallery.length ? gallery : undefined,
      featured: row.featured,
    };
  });

  cache = { items, featuredOrderById, expiresAt: now + CACHE_TTL_MS };
  return cache;
}

export async function listNews(): Promise<NewsItem[]> {
  if (db === null) {
    return allNews;
  }
  const { items } = await loadCache();
  return items;
}

export async function getNewsBySlug(slug: string): Promise<NewsItem | null> {
  if (db === null) {
    return allNews.find((item) => item.id === slug) ?? null;
  }
  const { items } = await loadCache();
  return items.find((item) => item.id === slug) ?? null;
}

export async function getFeaturedAndLatest(): Promise<{
  featured: NewsItem[];
  latest: NewsItem[];
}> {
  if (db === null) {
    return { featured: featuredNews, latest: latestNews };
  }
  const { items, featuredOrderById } = await loadCache();
  const featured = items
    .filter((item) => item.featured)
    .sort((a, b) => (featuredOrderById.get(a.id) ?? 0) - (featuredOrderById.get(b.id) ?? 0))
    .slice(0, 3);
  const latest = items.filter((item) => !item.featured).slice(0, 6);
  return { featured, latest };
}

/** Вызовет админка на этапе 5 после записи в БД; сейчас нигде не вызывается. */
export function resetNewsCache(): void {
  cache = null;
}
