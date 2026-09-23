/**
 * Размеры фото, пришедшие из браузера. Значение приходит полем формы, а
 * эндпоинт `/api/admin/upload` вызывается по HTTP напрямую (`CLAUDE.md`),
 * поэтому сырое значение проверяется на сервере и в таблицу не попадает
 * никогда.
 */

/**
 * Разумный предел стороны. `MAX_DIMENSION` (1600) тут не годится: GIF и файлы
 * не крупнее предела уходят в хранилище без пересжатия, то есть законный
 * размер сверху ничем не ограничен. Двадцать тысяч точек — заведомо больше
 * любой настоящей фотографии и заведомо меньше значений, на которых начинают
 * врать числа.
 */
export const MAX_PHOTO_DIMENSION = 20000;

function side(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PHOTO_DIMENSION) return null;
  return parsed;
}

/**
 * Пара сторон или `null`. Обе или ничего: одна сторона правилу «маленькая
 * обложка» бесполезна, а полустрока в базе врала бы убедительнее пустой.
 */
export function parsePhotoSize(
  width: unknown,
  height: unknown,
): { width: number; height: number } | null {
  const w = side(width);
  const h = side(height);
  return w !== null && h !== null ? { width: w, height: h } : null;
}
