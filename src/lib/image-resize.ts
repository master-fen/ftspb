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

export async function readLongSide(file: Blob): Promise<number> {
  const bitmap = await createImageBitmap(file);
  const longSide = Math.max(bitmap.width, bitmap.height);
  bitmap.close();
  return longSide;
}

export async function resizeToJpeg(file: Blob, longSide: number): Promise<Blob> {
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

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось сжать изображение"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/**
 * Правило (согласовано отдельно): GIF никогда не трогаем — анимация не
 * переживёт canvas. Всё остальное (JPEG/PNG/WebP) больше `maxDimension` px по
 * длинной стороне уменьшается и перекодируется в JPEG 0.82, независимо от
 * исходного формата — один энкодер на все случаи, прозрачность PNG в жертву.
 * Иначе — отправляем как есть.
 */
export async function prepareFileForUpload(
  file: File,
  maxDimension: number = MAX_DIMENSION,
): Promise<{ blob: Blob; filename: string }> {
  if (file.type === "image/gif") {
    return { blob: file, filename: file.name };
  }
  const longSide = await readLongSide(file);
  if (longSide > maxDimension) {
    const blob = await resizeToJpeg(file, maxDimension);
    return { blob, filename: replaceExtension(file.name, "jpg") };
  }
  return { blob: file, filename: file.name };
}
