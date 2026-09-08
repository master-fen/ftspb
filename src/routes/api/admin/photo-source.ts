import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { newsPhoto } from "@/db/schema";
import { detectImageSignature, MAX_UPLOAD_BYTES } from "@/lib/image-validation";
import { getCurrentSession } from "@/server/auth";
import { getS3Client } from "@/server/storage";

/** Только фотография из БД, только для авторизованного редактора; URL извне не принимается. */
export const Route = createFileRoute("/api/admin/photo-source")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await getCurrentSession()))
          return Response.json({ error: "Требуется авторизация" }, { status: 401 });
        const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
        if (!id.success)
          return Response.json({ error: "Некорректная фотография" }, { status: 400 });
        if (!db) return Response.json({ error: "База данных недоступна" }, { status: 503 });
        const [photo] = await db
          .select({ key: newsPhoto.s3Key })
          .from(newsPhoto)
          .where(eq(newsPhoto.id, id.data))
          .limit(1);
        if (!photo) return Response.json({ error: "Фотография не найдена" }, { status: 404 });
        try {
          const { client, bucket } = getS3Client();
          const result = await client.send(
            new GetObjectCommand({
              Bucket: bucket,
              Key: photo.key,
              Range: `bytes=0-${MAX_UPLOAD_BYTES}`,
            }),
          );
          if (!result.Body) throw new Error("Empty image");
          const bytes = await result.Body.transformToByteArray();
          if (bytes.length > MAX_UPLOAD_BYTES)
            return Response.json({ error: "Фото больше 15 МБ" }, { status: 413 });
          const type = detectImageSignature(Buffer.from(bytes));
          if (!type || type === "image/gif")
            return Response.json(
              { error: "Кадрирование поддерживает JPEG, PNG и WebP" },
              { status: 400 },
            );
          return new Response(new Uint8Array(bytes).buffer, {
            headers: {
              "Content-Type": type,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return Response.json({ error: "Не удалось прочитать фотографию" }, { status: 502 });
        }
      },
    },
  },
});
