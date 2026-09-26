/**
 * Значения строки `document` для документа архивной новости — одно место на
 * оба пути вставки scripts/migrate-archive.ts (поштучная запись, в том числе
 * `--add-only`, и `--replace-all`), чтобы они не разошлись.
 *
 * Потребитель один — scripts/migrate-archive.ts под bun, поэтому импорты без
 * расширения, как в scripts/archive-migration-rules.ts.
 */
import path from "node:path";
import type { document } from "../src/db/schema";

/**
 * Архивный документ живёт внутри своей новости: файл открывается из неё по
 * `/news-file/…`, и от флага это не зависит. В общий список документов
 * (`/documents`, `/federation/documents`) его вносит редактор галочкой в
 * админке. Документы, заведённые в админке, сюда не относятся — у них
 * умолчание колонки (true). Почему так — docs/decisions.md.
 */
export const ARCHIVE_DOCUMENT_IN_LIBRARY = false;

export type ArchiveDocumentOwner = {
  title: string;
  section: (typeof document.$inferInsert)["section"];
  publishedAt: string;
};

export type ArchiveDocumentFile = {
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
};

export function archiveDocumentValues(
  owner: ArchiveDocumentOwner,
  file: ArchiveDocumentFile,
): typeof document.$inferInsert {
  return {
    title: owner.title,
    s3Key: file.s3Key,
    fileName: path.basename(file.s3Key),
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    section: owner.section,
    documentDate: owner.publishedAt,
    status: "published",
    inLibrary: ARCHIVE_DOCUMENT_IN_LIBRARY,
  };
}
