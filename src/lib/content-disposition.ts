// Символы, запрещённые в именах файлов на большинстве ОС, плюс управляющие
// символы (\x00-\x1F, \x7F) — включая CR/LF. Заголовок собирается напрямую
// из пользовательского ввода (название документа), без вычистки CR/LF это
// была бы инъекция в HTTP-заголовок.
// eslint-disable-next-line no-control-regex -- вычистка управляющих символов намеренная, см. комментарий выше
const FORBIDDEN_CHARS = /[\x00-\x1f\x7f/\\:*?"<>|]/g;

/** Единственный источник предела длины title — используется и здесь как
 * защитный пояс чистой функции, и в src/routes/api/admin/upload.ts как
 * ранняя проверка до заливки объекта в S3. */
export const MAX_TITLE_LENGTH = 200;

function encodeRFC5987(value: string): string {
  return encodeURIComponent(value)
    .replace(/['()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/\*/g, "%2A")
    .replace(/%(7C|60|5E)/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Собирает значение заголовка Content-Disposition: посетитель сохраняет
 * файл под человеческим именем (название документа + оригинальное
 * расширение), а не под ключом вида u3f8a91c2.pdf. `inline`, не
 * `attachment` — PDF открывается во вкладке браузера, имя подставляется
 * только при сохранении.
 */
export function buildContentDisposition(title: string, extension: string): string {
  const cleaned = title.replace(FORBIDDEN_CHARS, "").trim();
  const base = (cleaned || "document").slice(0, MAX_TITLE_LENGTH).trim() || "document";
  const filename = `${base}.${extension}`;
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_");
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeRFC5987(filename)}`;
}
