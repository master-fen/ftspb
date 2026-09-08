export const COVER_RATIO = 16 / 9;

/** Source coordinates shared by the preview and canvas export. */
export function coverCrop(width: number, height: number, zoom: number, x: number, y: number) {
  if (![width, height, zoom, x, y].every(Number.isFinite) || width <= 0 || height <= 0)
    throw new Error("Некорректный размер изображения");
  const cropWidth = Math.min(width, height * COVER_RATIO) / Math.max(1, Math.min(3, zoom));
  const cropHeight = cropWidth / COVER_RATIO;
  return {
    width: cropWidth,
    height: cropHeight,
    left: ((width - cropWidth) * Math.max(0, Math.min(100, x))) / 100,
    top: ((height - cropHeight) * Math.max(0, Math.min(100, y))) / 100,
    outputWidth: Math.max(1, Math.min(1600, Math.round(cropWidth))),
    outputHeight: Math.max(1, Math.round(Math.min(1600, Math.round(cropWidth)) / COVER_RATIO)),
  };
}
