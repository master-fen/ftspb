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
