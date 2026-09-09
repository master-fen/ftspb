/**
 * Бейдж формата для строки файла (DocumentFileRow): по mime-типу, а при
 * неизвестном mime — по расширению имени файла. Всегда короткая строка
 * прописными: `PDF`, `DOCX`, `ZIP`, …, иначе `FILE`.
 */
const BADGE_BY_MIME: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
};

const MAX_EXTENSION_LENGTH = 4;

export function documentBadge(mimeType: string, fileName: string): string {
  const byMime = BADGE_BY_MIME[mimeType.trim().toLowerCase()];
  if (byMime !== undefined) {
    return byMime;
  }

  const dot = fileName.lastIndexOf(".");
  // Нет точки, точка первая («.htaccess») или последняя («name.») — расширения нет.
  if (dot <= 0 || dot === fileName.length - 1) {
    return "FILE";
  }
  const extension = fileName.slice(dot + 1);
  if (extension.length > MAX_EXTENSION_LENGTH || /[^a-z0-9]/i.test(extension)) {
    return "FILE";
  }
  return extension.toUpperCase();
}
