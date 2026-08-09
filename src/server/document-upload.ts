import { randomBytes } from "node:crypto";
import { buildContentDisposition } from "@/lib/content-disposition";
import type { SupportedDocumentType } from "@/lib/image-validation";
import { getCurrentSession } from "@/server/auth";
import { buildImageUrl } from "@/server/news";
import { objectExists, uploadObject } from "@/server/storage";

async function pickUniqueDocumentKey(extension: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `documents/u${randomBytes(4).toString("hex")}.${extension}`;
    if (!(await objectExists(candidate))) {
      return candidate;
    }
  }
  throw new Error("Не удалось подобрать уникальный ключ файла");
}

export type UploadDocumentInput = {
  title: string;
  extension: string;
  contentType: SupportedDocumentType;
  body: Buffer;
  fileName: string;
};

export type UploadDocumentResult = {
  key: string;
  url: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
};

/**
 * Только заливает объект в S3 и возвращает его метаданные — строку в
 * `document` не создаёт (это сделает форма документа в следующем PR, у неё
 * будут documentDate/section/status/inLibrary, которых здесь ещё нет).
 * Поэтому отката тут нет: нечего откатывать, БД не тронута.
 */
export async function uploadDocumentFile(
  input: UploadDocumentInput,
): Promise<UploadDocumentResult> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Требуется активная сессия администратора");
  }

  const key = await pickUniqueDocumentKey(input.extension);
  const disposition = buildContentDisposition(input.title, input.extension);
  await uploadObject(key, input.body, input.contentType, disposition);

  return {
    key,
    url: buildImageUrl(key),
    fileName: input.fileName,
    sizeBytes: input.body.length,
    mimeType: input.contentType,
  };
}
