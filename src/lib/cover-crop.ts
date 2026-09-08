export const COVER_RATIO = 16 / 9;

/** Длинная сторона экспорта — не больше 1600px, как у prepareFileForUpload. */
const MAX_OUTPUT_LONG_SIDE = 1600;

/**
 * Source coordinates shared by the preview and canvas export.
 * `ratio` = width / height кадра: 16:9 для обложки новости (по умолчанию),
 * 3:4 для фото персоны. Длинная сторона экспорта ограничена 1600px по любой
 * стороне: при портретном ratio ограничивается высота, иначе ширина.
 */
export function coverCrop(
  width: number,
  height: number,
  zoom: number,
  x: number,
  y: number,
  ratio: number = COVER_RATIO,
) {
  if (
    ![width, height, zoom, x, y, ratio].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    ratio <= 0
  )
    throw new Error("Некорректный размер изображения");
  const cropWidth = Math.min(width, height * ratio) / Math.max(1, Math.min(3, zoom));
  const cropHeight = cropWidth / ratio;
  const maxOutputWidth = ratio >= 1 ? MAX_OUTPUT_LONG_SIDE : MAX_OUTPUT_LONG_SIDE * ratio;
  const outputWidth = Math.max(1, Math.min(maxOutputWidth, Math.round(cropWidth)));
  return {
    width: cropWidth,
    height: cropHeight,
    left: ((width - cropWidth) * Math.max(0, Math.min(100, x))) / 100,
    top: ((height - cropHeight) * Math.max(0, Math.min(100, y))) / 100,
    outputWidth,
    outputHeight: Math.max(1, Math.round(outputWidth / ratio)),
  };
}
