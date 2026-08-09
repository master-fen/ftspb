export type SupportedImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const EXTENSION_BY_TYPE: Record<SupportedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export function isWithinSizeLimit(
  sizeBytes: number,
  limitBytes: number = MAX_UPLOAD_BYTES,
): boolean {
  return sizeBytes <= limitBytes;
}

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

function matchesAt(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Определяет тип изображения по первым байтам содержимого, а не по
 * клиентскому Content-Type (который ничего не гарантирует). Это и есть
 * белый список: не совпало ни с одной сигнатурой — `null`, значит отклонить.
 */
export function detectImageSignature(bytes: Uint8Array): SupportedImageType | null {
  if (matchesAt(bytes, 0, PNG_SIGNATURE)) return "image/png";
  if (matchesAt(bytes, 0, JPEG_SIGNATURE)) return "image/jpeg";
  if (matchesAt(bytes, 0, GIF_SIGNATURE)) return "image/gif";
  if (matchesAt(bytes, 0, RIFF_SIGNATURE) && matchesAt(bytes, 8, WEBP_SIGNATURE))
    return "image/webp";
  return null;
}

export type SupportedDocumentType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "application/msword"
  | "application/vnd.ms-excel";

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_SIGNATURE = [0x50, 0x4b]; // PK
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const ZIP_EXTENSIONS: Record<string, SupportedDocumentType> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const OLE2_EXTENSIONS: Record<string, SupportedDocumentType> = {
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
};

function detectDocumentFamily(bytes: Uint8Array): "pdf" | "zip" | "ole2" | null {
  if (matchesAt(bytes, 0, PDF_SIGNATURE)) return "pdf";
  if (matchesAt(bytes, 0, ZIP_SIGNATURE)) return "zip";
  if (matchesAt(bytes, 0, OLE2_SIGNATURE)) return "ole2";
  return null;
}

/**
 * Как detectImageSignature, но сигнатура определяет только семейство
 * формата (PDF / ZIP-контейнер / OLE2-контейнер) — расширение исходного
 * имени файла уточняет конкретный тип внутри семейства, совпасть обязаны
 * оба. Внутрь ZIP не заглядываем (отличить .docx от произвольного архива
 * по содержимому — отдельная работа, не окупается: загружать может только
 * авторизованный сотрудник Федерации).
 */
export function detectDocumentSignature(
  bytes: Uint8Array,
  extension: string,
): SupportedDocumentType | null {
  const ext = extension.toLowerCase();
  const family = detectDocumentFamily(bytes);
  if (family === "pdf") return ext === "pdf" ? "application/pdf" : null;
  if (family === "zip") return ZIP_EXTENSIONS[ext] ?? null;
  if (family === "ole2") return OLE2_EXTENSIONS[ext] ?? null;
  return null;
}

/** Расширение файла (без точки, lowercase) по имени. Нет точки, или точка —
 * последний символ имени → "". */
export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}
