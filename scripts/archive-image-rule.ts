/**
 * Правило сжатия архивных фото — зеркало правила админки
 * (src/lib/image-resize.ts), вынесенное в чистые функции, чтобы отдельный
 * проход по диску (scripts/compress-archive.ts) можно было проверить тестами
 * без sharp и без файлов.
 *
 * Правило админки дословно:
 *   - GIF не трогаем вовсе (анимация не переживёт перекодирование);
 *   - файл, у которого длинная сторона не больше MAX_DIMENSION, уходит байт
 *     в байт под своим именем;
 *   - всё остальное перекодируется в JPEG и получает расширение .jpg.
 *
 * Документы (pdf, doc, xls и прочие) под правило не попадают — они
 * копируются как есть.
 */

/** Зеркало src/lib/image-resize.ts: MAX_DIMENSION. */
export const MAX_DIMENSION = 1600;

/** Зеркало src/lib/image-resize.ts: JPEG_QUALITY 0.82, у sharp — в процентах. */
export const JPEG_QUALITY = 82;

/** Расширения, которые мигратор считает изображениями (imageContentType). */
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export type ImageMeta = { format?: string; width?: number; height?: number };

export type FileAction =
  /** Не изображение — копия байт в байт. */
  | "copy-document"
  /** GIF — копия байт в байт, правило админки его не трогает. */
  | "copy-gif"
  /** Изображение в пределах MAX_DIMENSION — копия байт в байт. */
  | "copy-small"
  /** Длинная сторона больше MAX_DIMENSION — перекодирование в JPEG. */
  | "transform";

/** Расширение пути в нижнем регистре, с точкой. Пустая строка, если его нет. */
export function extensionOf(filePath: string): string {
  const name = filePath.slice(Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** Считается ли путь изображением: решается по расширению, как у мигратора. */
export function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(filePath));
}

/**
 * Что делать с файлом. `meta` — метаданные изображения (sharp) либо null для
 * документа. Изображение без размеров в метаданных — ошибка, а не «копируем
 * на всякий случай»: молча пропустить полноразмерный снимок опаснее, чем
 * остановиться.
 */
export function decideAction(filePath: string, meta: ImageMeta | null): FileAction {
  if (!isImagePath(filePath)) {
    return "copy-document";
  }
  if (meta === null) {
    throw new Error(`decideAction: для изображения ${filePath} не переданы метаданные`);
  }
  if (extensionOf(filePath) === ".gif" || meta.format === "gif") {
    return "copy-gif";
  }
  const longSide = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (longSide <= 0) {
    throw new Error(`decideAction: у изображения ${filePath} не прочитались размеры`);
  }
  return longSide > MAX_DIMENSION ? "transform" : "copy-small";
}

/** Меняется ли расширение: перекодирование даёт JPEG, остальное — нет. */
export function outputRelPath(relPath: string, action: FileAction): string {
  if (action !== "transform") {
    return relPath;
  }
  const dot = relPath.lastIndexOf(".");
  const slash = Math.max(relPath.lastIndexOf("/"), relPath.lastIndexOf("\\"));
  if (dot <= slash + 1) {
    return `${relPath}.jpg`;
  }
  return `${relPath.slice(0, dot)}.jpg`;
}

export type Collision = { out: string; sources: string[] };

/**
 * Разные исходные файлы, отобразившиеся в один выходной путь. Возникает при
 * смене расширения: `a.png` даёт `a.jpg` рядом с уже существующим `a.jpg`.
 * Такое молча перезаписывать нельзя — проход обязан остановиться до записи.
 */
export function collisions(map: ReadonlyMap<string, string>): Collision[] {
  const bySource = new Map<string, string[]>();
  for (const [from, to] of map) {
    const key = to.toLowerCase();
    const arr = bySource.get(key) ?? [];
    arr.push(from);
    bySource.set(key, arr);
  }
  const out: Collision[] = [];
  for (const [to, sources] of bySource) {
    if (sources.length > 1) {
      out.push({ out: to, sources: sources.slice().sort() });
    }
  }
  return out.sort((a, b) => a.out.localeCompare(b.out));
}
