import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { MAX_TITLE_LENGTH } from "@/lib/content-disposition";
import {
  detectDocumentSignature,
  detectImageSignature,
  getFileExtension,
  isWithinSizeLimit,
  MAX_UPLOAD_BYTES,
} from "@/lib/image-validation";
import { getCurrentSession } from "@/server/auth";
import { uploadDocumentFile } from "@/server/document-upload";
import { uploadNewsPhoto } from "@/server/news-admin";

function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/admin/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Тот же хелпер, что requireSession() внутри news-admin.ts — тот же
        // getCurrentSession(), только вызванный явно и раньше, до чтения тела.
        // Guard в admin/_authed/route.tsx — навигационный, этот эндпоинт не защищает.
        const session = await getCurrentSession();
        if (!session) {
          return errorResponse(401, "Требуется авторизация");
        }

        // Content-Length считает весь multipart-боди, а не только файл —
        // границы частей и остальные поля добавляют несколько сотен байт
        // сверху. Ранняя проверка — с запасом, чтобы файл ровно на лимите не
        // поймал ложный 413; окончательный критерий — file.size ниже.
        const contentLength = request.headers.get("content-length");
        if (contentLength && Number(contentLength) > MAX_UPLOAD_BYTES + 64 * 1024) {
          return errorResponse(413, "Файл больше 15 МБ");
        }

        let formData: FormData;
        try {
          formData = await request.formData(); // Request стандартный, свой парсер не нужен
        } catch {
          return errorResponse(400, "Не удалось прочитать данные формы");
        }

        const file = formData.get("file");
        if (!(file instanceof File)) {
          return errorResponse(400, "Не передан файл");
        }

        // kind не пришёл вовсе → "photo": так вело себя единственное поле
        // этого роута до появления документов, NewsPhotoGallery.tsx не
        // меняем и не заставляем присылать kind явно.
        const kindRaw = formData.get("kind");
        const kind = typeof kindRaw === "string" && kindRaw ? kindRaw : "photo";
        if (kind !== "photo" && kind !== "document") {
          return errorResponse(400, `Неизвестное значение kind: ${kind}`);
        }

        if (!isWithinSizeLimit(file.size)) {
          // Повторная проверка факта: Content-Length мог отсутствовать или соврать.
          return errorResponse(413, "Файл больше 15 МБ");
        }

        // Прямой вызов в одном процессе — server.handlers никогда не
        // попадает в клиентский бандл, поэтому импорт src/server/** здесь
        // легален (см. CLAUDE.md). Buffer никуда не сериализуется.
        const buffer = Buffer.from(await file.arrayBuffer());

        if (kind === "photo") {
          const newsId = formData.get("newsId");
          if (typeof newsId !== "string" || !newsId) {
            return errorResponse(400, "Не передан newsId");
          }

          const contentType = detectImageSignature(buffer);
          if (!contentType) {
            return errorResponse(
              400,
              "Файл не похож на изображение поддерживаемого формата (jpeg/png/gif/webp)",
            );
          }

          try {
            const result = await uploadNewsPhoto({ newsId, contentType, body: buffer });
            return Response.json(result);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Не удалось загрузить фото";
            const status = message.includes("не найдена")
              ? 404
              : message.includes("сессия")
                ? 401
                : 500;
            return errorResponse(status, message);
          }
        }

        // kind === "document"
        const titleRaw = formData.get("title");
        if (typeof titleRaw !== "string" || !titleRaw.trim()) {
          return errorResponse(400, "Не передано название документа");
        }
        if (titleRaw.length > MAX_TITLE_LENGTH) {
          // Отсекаем до заливки объекта в S3 — заголовок Content-Disposition
          // собирается из title и не может быть бесконечным.
          return errorResponse(400, `Название документа длиннее ${MAX_TITLE_LENGTH} символов`);
        }
        const title = titleRaw.trim();

        const extension = getFileExtension(file.name);
        const contentType = detectDocumentSignature(buffer, extension);
        if (!contentType) {
          return errorResponse(
            400,
            "Файл не похож на документ поддерживаемого формата (pdf/docx/xlsx/doc/xls), " +
              "или расширение не совпадает с содержимым",
          );
        }

        try {
          const result = await uploadDocumentFile({
            title,
            extension,
            contentType,
            body: buffer,
            fileName: file.name,
          });
          return Response.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Не удалось загрузить файл";
          const status = message.includes("сессия") ? 401 : 500;
          return errorResponse(status, message);
        }
      },
    },
  },
});
