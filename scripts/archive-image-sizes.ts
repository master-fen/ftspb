/**
 * Фаза размеров фото: размеры ВСЕХ кадров рабочего набора читаются до
 * первой записи в хранилище и в базу. Не прочитать размер — стоп, заливка
 * без размеров не начинается, поэтому ошибки копятся и печатаются разом.
 *
 * Вынесено из scripts/migrate-archive.ts целиком, дословно.
 */
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

/** Минимум полей записи выгрузки, нужный фазе размеров. */
export type SizedRecord = { Обложка?: string; Галерея?: string[] };

/** Размеры кадра так, как его покажет браузер. */
export type ImageSize = { width: number; height: number };

/** Сколько файлов читается одновременно — как в scripts/compress-archive.ts. */
const SIZE_CONCURRENCY = 8;

/** Прочитанные размеры по локальному пути файла; заполняется readImageSizes. */
const imageSizes = new Map<string, ImageSize>();

/**
 * Размеры одного файла. `metadata().width/height` — размеры как они лежат в
 * файле; при EXIF-ориентации 5–8 браузер показывает кадр повёрнутым, поэтому
 * стороны переставляются. В архиве таких файлов нет (замер 22.09.2026 по
 * сжатой выгрузке: 0 из 1678 обложек), но правило нужно и для будущих
 * заливок: молчаливо перепутанные стороны не видны ни в базе, ни на глаз.
 */
async function readImageSize(localPath: string): Promise<ImageSize> {
  const meta = await sharp(localPath).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) {
    throw new Error("в метаданных нет ширины или высоты");
  }
  const rotated = (meta.orientation ?? 1) >= 5;
  return rotated ? { width: h, height: w } : { width: w, height: h };
}

/**
 * Фаза целиком: размеры ВСЕХ фото рабочего набора читаются до первой записи в
 * S3 и в базу. Задание: не прочитать размер — стоп, не заливать без размеров.
 * Поэтому ошибки копятся и печатаются все разом, а прогон падает до заливки,
 * а не на середине.
 */
export async function readImageSizes(
  records: ReadonlyArray<SizedRecord>,
  assets: string,
): Promise<void> {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const items = [record["Обложка"], ...(record["Галерея"] ?? [])];
    for (const item of items) {
      if (!item || /^https?:\/\//i.test(item)) continue;
      const localPath = path.join(assets, item);
      if (seen.has(localPath)) continue;
      seen.add(localPath);
      paths.push(localPath);
    }
  }

  const failures: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const localPath = paths[next++];
      try {
        imageSizes.set(localPath, await readImageSize(localPath));
      } catch (error) {
        failures.push(`${localPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: SIZE_CONCURRENCY }, worker));

  console.log(`─── размеры фото: прочитано ${imageSizes.size} из ${paths.length} ───`);
  if (failures.length > 0) {
    console.error(`Размер не прочитан у ${failures.length} файлов — заливка отменена:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
}

/** Размер уже прочитанного файла; отсутствие — ошибка сборки плана, не заливки. */
export function sizeOf(localPath: string, context: string): ImageSize {
  const size = imageSizes.get(localPath);
  if (!size) {
    throw new Error(`Размер файла не прочитан: ${localPath} (${context})`);
  }
  return size;
}
