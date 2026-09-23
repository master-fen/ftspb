/**
 * Уменьшение фото в браузере перед загрузкой — общий модуль для фото новостей
 * (NewsPhotoGallery) и фото персоны (PersonPhotoSection). Только клиент:
 * createImageBitmap и canvas.
 */

export const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

function replaceExtension(filename: string, ext: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return `${base}.${ext}`;
}

/**
 * Размеры декодированного файла. Одно декодирование даёт и длинную сторону
 * (по ней решается, сжимать ли), и обе стороны для `news_photo.width/height`.
 * Бросает, как прежний `readLongSide`: нечитаемый не-GIF — это отказ загрузки,
 * а не молчаливая отправка несжатого файла.
 */
export async function readImageSize(file: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** То же без исключения — для GIF, который декодируется только ради размеров. */
async function tryReadImageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    return await readImageSize(file);
  } catch {
    return null;
  }
}

/** Уменьшенный JPEG и его размеры — ровно те, что у холста. */
export async function resizeToJpeg(
  file: Blob,
  longSide: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas недоступен в этом браузере");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось сжать изображение"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
  return { blob, width, height };
}

/**
 * Правило (согласовано отдельно): GIF никогда не трогаем — анимация не
 * переживёт canvas. Всё остальное (JPEG/PNG/WebP) больше `maxDimension` px по
 * длинной стороне уменьшается и перекодируется в JPEG 0.82, независимо от
 * исходного формата — один энкодер на все случаи, прозрачность PNG в жертву.
 * Иначе — отправляем как есть.
 *
 * `width`/`height` — размеры именно того файла, который уедет в хранилище:
 * у сжатого это размеры холста, у остальных — размеры декодирования. GIF не
 * перекодируется, но декодируется ради размеров (первый кадр). Прочитать не
 * удалось — полей нет, загрузка идёт как раньше.
 */
export async function prepareFileForUpload(
  file: File,
  maxDimension: number = MAX_DIMENSION,
): Promise<{ blob: Blob; filename: string; width?: number; height?: number }> {
  if (file.type === "image/gif") {
    const size = await tryReadImageSize(file);
    return { blob: file, filename: file.name, width: size?.width, height: size?.height };
  }
  const size = await readImageSize(file);
  if (Math.max(size.width, size.height) > maxDimension) {
    const resized = await resizeToJpeg(file, maxDimension);
    return {
      blob: resized.blob,
      filename: replaceExtension(file.name, "jpg"),
      width: resized.width,
      height: resized.height,
    };
  }
  return { blob: file, filename: file.name, width: size.width, height: size.height };
}
