import process from "node:process";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { TIMEWEB_CA } from "../src/db/ca";
import * as schema from "../src/db/schema";
import { deleteObject, headObject } from "../src/server/storage";

const { news, newsPhoto } = schema;

/**
 * `drizzle-kit`/`src/db/client.ts` берут схему из `DB_SCHEMA` в момент
 * статического импорта — раньше, чем разберётся `--schema`. Поэтому здесь
 * свой postgres()+drizzle(), как в scripts/migrate-archive.ts: search_path —
 * только из аргумента командной строки, `DB_SCHEMA` из .env игнорируется.
 *
 * Скрипт НЕ пишет cover_photo_id — он его только сверяет. Устраняет
 * буквальные дубли строк news_photo (одна и та же картинка залита дважды:
 * на position=0 как обложка и на position=1 как первый элемент галереи —
 * наследие миграции архива), удаляя строку/объект position=1, когда он
 * побайтово совпадает с обложкой.
 *
 * Отдельно обрабатывает осиротевшие строки: если position=1 уже удалён из
 * S3 (например, скрипт ранее отработал на другой схеме, а бакет общий), в
 * этой схеме удаляется только строка news_photo — объекта в S3 для неё уже
 * нет.
 */

// ───────────────────────── аргументы ─────────────────────────

function parseArgs(argv: string[]) {
  let schemaArg: string | undefined;
  let dryRun = false;
  let limit: number | undefined;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--schema=")) {
      schemaArg = arg.slice("--schema=".length);
    } else if (arg.startsWith("--limit=")) {
      limit = Number(arg.slice("--limit=".length));
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  if (schemaArg !== "dev" && schemaArg !== "public") {
    throw new Error('--schema обязателен и должен быть "dev" или "public"');
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit должен быть положительным целым числом");
  }

  return { schemaArg, dryRun, limit };
}

const { schemaArg, dryRun, limit } = parseArgs(process.argv.slice(2));

// ───────────────────────── подключение к БД (лениво) ─────────────────────────

let sqlInstance: ReturnType<typeof postgres> | undefined;
let dbInstance: PostgresJsDatabase<typeof schema> | undefined;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL не задан");
    }
    sqlInstance = postgres(connectionString, {
      max: 1,
      connection: { search_path: schemaArg },
      ssl: { ca: TIMEWEB_CA, rejectUnauthorized: true },
    });
    dbInstance = drizzle(sqlInstance, { schema });
  }
  return dbInstance;
}

// ───────────────────────── типы ─────────────────────────

type PhotoRow = { id: string; newsId: string; s3Key: string; position: number };
type NewsRow = { id: string; slug: string; coverPhotoId: string | null };

type Violation = { slug: string; reason: string };

type Candidate = { newsId: string; slug: string; photos: PhotoRow[] };

// ───────────────────────── фаза A: предполётная проверка ─────────────────────────

/**
 * Проверяет ВСЕ новости с фото целиком и только потом возвращает решение.
 * Если нарушение хотя бы одно — вызывающий код обязан остановиться до
 * фазы B: не должно быть так, что часть новостей уже обработана, а
 * проверка ещё не дошла до конца списка.
 */
async function preflight(): Promise<{ violations: Violation[]; candidates: Candidate[] }> {
  const db = getDb();

  const newsRows: NewsRow[] = await db
    .select({ id: news.id, slug: news.slug, coverPhotoId: news.coverPhotoId })
    .from(news);
  const photoRows: PhotoRow[] = await db
    .select({
      id: newsPhoto.id,
      newsId: newsPhoto.newsId,
      s3Key: newsPhoto.s3Key,
      position: newsPhoto.position,
    })
    .from(newsPhoto)
    .orderBy(newsPhoto.position);

  const newsById = new Map(newsRows.map((row) => [row.id, row]));

  const photosByNewsId = new Map<string, PhotoRow[]>();
  for (const photo of photoRows) {
    const arr = photosByNewsId.get(photo.newsId) ?? [];
    arr.push(photo);
    photosByNewsId.set(photo.newsId, arr);
  }

  const violations: Violation[] = [];
  const candidates: Candidate[] = [];

  for (const [newsId, photos] of photosByNewsId) {
    const newsRow = newsById.get(newsId);
    if (!newsRow) {
      violations.push({ slug: `(news_id=${newsId})`, reason: "новость не найдена по news_id" });
      continue;
    }

    if (!newsRow.coverPhotoId) {
      violations.push({ slug: newsRow.slug, reason: "cover_photo_id пуст, а фото есть" });
      continue;
    }

    const coverRow = photos.find((p) => p.id === newsRow.coverPhotoId);
    if (!coverRow) {
      violations.push({
        slug: newsRow.slug,
        reason: `cover_photo_id (${newsRow.coverPhotoId}) не указывает на фото этой новости`,
      });
      continue;
    }

    if (coverRow.position !== 0) {
      violations.push({
        slug: newsRow.slug,
        reason: `обложка не на position=0 (position=${coverRow.position})`,
      });
      continue;
    }

    candidates.push({ newsId, slug: newsRow.slug, photos });
  }

  return { violations, candidates };
}

// ───────────────────────── фаза B: обработка ─────────────────────────

type Outcome = "already-clean" | "deleted" | "orphan-row" | "skipped";

/**
 * HeadObject на 404 не гарантирует конкретное имя ошибки на S3-совместимых
 * эндпоинтах вне AWS — статус-код надёжнее, чем `err.name`.
 */
function isS3NotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("$metadata" in err)) {
    return false;
  }
  const metadata = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return metadata?.httpStatusCode === 404;
}

async function deletePhotoRowAndRenumber(
  candidate: Candidate,
  photoToRemove: PhotoRow,
): Promise<void> {
  const db = getDb();
  const remaining = candidate.photos
    .filter((p) => p.id !== photoToRemove.id)
    .sort((a, b) => a.position - b.position);

  await db.transaction(async (tx) => {
    await tx.delete(newsPhoto).where(eq(newsPhoto.id, photoToRemove.id));
    for (let idx = 0; idx < remaining.length; idx++) {
      if (remaining[idx].position !== idx) {
        await tx
          .update(newsPhoto)
          .set({ position: idx })
          .where(eq(newsPhoto.id, remaining[idx].id));
      }
    }
  });
}

async function processCandidate(candidate: Candidate): Promise<Outcome> {
  const { slug, photos } = candidate;
  const photo0 = photos.find((p) => p.position === 0)!;
  const photo1 = photos.find((p) => p.position === 1);

  if (!photo1) {
    return "already-clean";
  }

  // Случай 1: обложка не найдена — настоящая проблема, ничего не трогаем.
  let head0: { size: number; etag: string };
  try {
    head0 = await headObject(photo0.s3Key);
  } catch (err) {
    if (isS3NotFound(err)) {
      console.warn(`[warn] ${slug}: обложка не найдена в S3 (${photo0.s3Key})`);
    } else {
      console.warn(`[warn] ${slug}: не удалось прочитать обложку из S3 (${photo0.s3Key}): ${err}`);
    }
    return "skipped";
  }

  // Случай 2: обложка на месте, position=1 отсутствует в S3 — осиротевшая
  // строка (объект уже удалён прошлым прогоном на другой схеме общего
  // бакета). Удаляем только строку в БД, deleteObject не вызываем — в S3
  // удалять нечего.
  let head1: { size: number; etag: string };
  try {
    head1 = await headObject(photo1.s3Key);
  } catch (err) {
    if (!isS3NotFound(err)) {
      console.warn(
        `[warn] ${slug}: не удалось прочитать position=1 из S3 (${photo1.s3Key}): ${err}`,
      );
      return "skipped";
    }

    if (dryRun) {
      console.log(
        `[plan-orphan] ${slug}: удалил бы осиротевшую строку position=1 ` +
          `(${photo1.s3Key}, объекта в S3 уже нет)`,
      );
      return "orphan-row";
    }

    await deletePhotoRowAndRenumber(candidate, photo1);
    console.log(
      `[orphan] ${slug}: удалена осиротевшая строка position=1 ` +
        `(${photo1.s3Key}, объекта в S3 уже нет)`,
    );
    return "orphan-row";
  }

  // Случай 3: оба найдены — сравнить как раньше.
  const match = head0.size === head1.size && head0.etag === head1.etag;
  if (!match) {
    console.warn(
      `[warn] ${slug}: обложка и position=1 не совпадают — ` +
        `${photo0.s3Key} (size=${head0.size}, etag=${head0.etag}) vs ` +
        `${photo1.s3Key} (size=${head1.size}, etag=${head1.etag}) — пропущено`,
    );
    return "skipped";
  }

  if (dryRun) {
    console.log(
      `[plan] ${slug}: удалил бы дубликат ${photo1.s3Key} (обложка ${photo0.s3Key} остаётся)`,
    );
    return "deleted";
  }

  // DB-транзакция коммитится первой: если процесс оборвётся между шагами,
  // в БД никогда не останется ссылки на уже удалённый из S3 объект (битая
  // картинка на сайте). В худшем случае в S3 останется безвредный
  // неиспользуемый объект — заметно и безопасно поправить следующим прогоном.
  await deletePhotoRowAndRenumber(candidate, photo1);
  await deleteObject(photo1.s3Key);

  console.log(
    `[deleted] ${slug}: удалён дубликат ${photo1.s3Key} (обложка ${photo0.s3Key} осталась)`,
  );
  return "deleted";
}

// ───────────────────────── main ─────────────────────────

async function main() {
  console.log(`Дедупликация обложек (schema=${schemaArg}, dry-run=${dryRun})`);

  const { violations, candidates } = await preflight();

  if (violations.length > 0) {
    console.error(`Предполётная проверка не пройдена — нарушений: ${violations.length}`);
    for (const v of violations) {
      console.error(`  [problem] ${v.slug}: ${v.reason}`);
    }
    console.error("Изменения не вносились.");
    if (sqlInstance) {
      await sqlInstance.end();
    }
    process.exit(1);
  }

  console.log(`Предполётная проверка пройдена: новостей с фото — ${candidates.length}`);

  const toProcess = limit !== undefined ? candidates.slice(0, limit) : candidates;

  let alreadyClean = 0;
  let deleted = 0;
  let orphanRows = 0;
  let skippedWarning = 0;

  for (const candidate of toProcess) {
    const outcome = await processCandidate(candidate);
    if (outcome === "already-clean") alreadyClean += 1;
    else if (outcome === "deleted") deleted += 1;
    else if (outcome === "orphan-row") orphanRows += 1;
    else skippedWarning += 1;
  }

  console.log("───────────────────────────────────────");
  console.log(`Обработано новостей: ${toProcess.length}`);
  console.log(`Уже чисто: ${alreadyClean}`);
  console.log(`Пропущено с предупреждением: ${skippedWarning}`);
  console.log(`Удалено объектов: ${deleted}`);
  console.log(`Осиротевших строк удалено: ${orphanRows}`);

  if (sqlInstance) {
    await sqlInstance.end();
  }
}

await main();
