import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { news, newsPhoto } from "@/db/schema";
import { HttpError } from "@/lib/http-error";
import { featuredNewsInput, featuredSignature } from "@/lib/featured-news-input";
import { getCurrentSession } from "@/server/auth";
import { resetNewsCache } from "@/server/news-cache";
import { buildImageUrl } from "@/server/storage";

async function requireEditor() {
  if (!(await getCurrentSession()))
    throw new HttpError(401, "Требуется активная сессия администратора");
  if (!db) throw new Error("Требуется БД");
  return db;
}

export async function getFeaturedEditor() {
  const database = await requireEditor();
  return database.transaction(
    async (reader) => {
      const rows = await reader
        .select({
          id: news.id,
          title: news.title,
          date: news.publishedAt,
          featured: news.featured,
          featuredOrder: news.featuredOrder,
          key: newsPhoto.s3Key,
        })
        .from(news)
        .leftJoin(newsPhoto, eq(news.coverPhotoId, newsPhoto.id))
        .where(and(eq(news.status, "published"), isNull(news.deletedAt)))
        .orderBy(desc(news.publishedAt), asc(news.id));
      const allFeatured = await reader
        .select({ id: news.id, featuredOrder: news.featuredOrder })
        .from(news)
        .where(eq(news.featured, true));
      return {
        items: rows.map(({ key, ...row }) => ({ ...row, cover: key ? buildImageUrl(key) : null })),
        selected: rows
          .filter((r) => r.featured)
          .sort(
            (a, b) =>
              (a.featuredOrder ?? Number.MAX_SAFE_INTEGER) -
              (b.featuredOrder ?? Number.MAX_SAFE_INTEGER),
          )
          .slice(0, 3)
          .map((r) => r.id),
        expected: featuredSignature(allFeatured),
        extraCount: Math.max(
          0,
          allFeatured.length - Math.min(3, rows.filter((row) => row.featured).length),
        ),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function saveFeaturedEditor(input: unknown) {
  const database = await requireEditor();
  const { ids, expected } = featuredNewsInput.parse(input);
  await database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7380039)`);
    const current = await tx
      .select({ id: news.id, featuredOrder: news.featuredOrder })
      .from(news)
      .where(eq(news.featured, true));
    if (featuredSignature(current) !== expected)
      throw new Error("Главные новости уже изменены. Обновите список и повторите выбор.");
    if (ids.length) {
      const candidates = await tx
        .select({ id: news.id })
        .from(news)
        .where(and(inArray(news.id, ids), eq(news.status, "published"), isNull(news.deletedAt)))
        .for("update");
      if (candidates.length !== ids.length)
        throw new Error(
          "Одна из выбранных новостей удалена или стала черновиком. Обновите список.",
        );
    }
    await tx
      .update(news)
      .set({ featured: false, featuredOrder: null, updatedAt: new Date() })
      .where(eq(news.featured, true));
    for (const [position, id] of ids.entries()) {
      await tx
        .update(news)
        .set({ featured: true, featuredOrder: position, updatedAt: new Date() })
        .where(eq(news.id, id));
    }
  });
  resetNewsCache();
}
