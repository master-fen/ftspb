import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { document, news, newsDocument } from "@/db/schema";
import { newsFileKey, newsFileVerdict, type NewsFileRow } from "@/lib/news-file-url";
import { buildImageUrl } from "@/server/storage";

/** Файла нет — 404, не ошибка сервера: отсутствующее вложение не авария. */
function notFound(): Response {
  return new Response("Файл не найден", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Постоянный адрес файла новости: `/news-file/СЛАГ/NN.ext` →
 * перенаправление на текущий адрес объекта в хранилище.
 *
 * Адрес хранилища зависит от хостинга, поэтому в тела архивных новостей
 * уезжает этот адрес, а не прямая ссылка на бакет: при переносе достаточно
 * сменить `S3_ENDPOINT`/`S3_BUCKET`, и 1211 ссылок в боевой базе останутся
 * рабочими.
 *
 * Маршрут обслуживает только файлы новостей: ключ хранилища собирается из
 * двух проверенных сегментов адреса, и вывести его за пределы
 * `news/…/documents/` из запроса нельзя. Цель перенаправления берётся из
 * строки базы через `buildImageUrl` — из запроса в неё не попадает ничего.
 *
 * Только `server.handlers`, без `component` и `loader`, поэтому прямой импорт
 * `src/server/**` здесь легален (`CLAUDE.md`).
 */
export const Route = createFileRoute("/news-file/$slug/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = newsFileKey(params);
        if (key === null) return notFound();
        // Без базы файлов нет вовсе (режим моков при пустом DATABASE_URL).
        if (!db) return notFound();

        // Единственное условие выборки — ключ хранилища. По слагу новости
        // искать нельзя: слаг меняется в админке, ключи после заливки — нет.
        const rows = await db
          .select({
            s3Key: document.s3Key,
            documentStatus: document.status,
            documentDeletedAt: document.deletedAt,
            newsStatus: news.status,
            newsDeletedAt: news.deletedAt,
          })
          .from(document)
          .innerJoin(newsDocument, eq(newsDocument.documentId, document.id))
          .innerJoin(news, eq(news.id, newsDocument.newsId))
          .where(eq(document.s3Key, key));

        const verdict = newsFileVerdict(
          rows.map(
            (r): NewsFileRow => ({
              s3Key: r.s3Key,
              documentPublished: r.documentStatus === "published",
              documentDeleted: r.documentDeletedAt !== null,
              newsPublished: r.newsStatus === "published",
              newsDeleted: r.newsDeletedAt !== null,
            }),
          ),
        );
        if (!verdict.ok) return notFound();

        return new Response(null, {
          status: 302,
          headers: {
            Location: buildImageUrl(verdict.s3Key),
            // Адрес хранилища может смениться — закэшированное
            // перенаправление обессмыслило бы весь приём.
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
