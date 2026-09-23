import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { count, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describeTarget, sslFor } from "../src/db/ssl";
import * as schema from "../src/db/schema";
import { allNews, featuredNews } from "../src/data/mock";
import { LEGACY_SLUG_MAX_LENGTH, slugify, truncateSlug } from "../src/server/slug";
import { headObject, isS3NotFound, uploadObject } from "../src/server/storage";
import { textToHtml } from "./text-to-html";
import {
  type ExistingNewsRow,
  type PlanIdentity,
  type RemoteObject,
  checkReplaceAllCoverage,
  createdAtByIndex,
  decideUpload,
  indexByTitleDate,
  normalizeTitle,
  partitionAddOnly,
  resolveSlugs,
  titleDateOverlap,
} from "./archive-migration-rules";
import {
  DOCUMENT_MARKER_SCHEME,
  RECORD_MARKER_SCHEME,
  documentFileName,
  documentHrefsByPath,
  hasDocumentMarkerResidue,
  hasMarkerResidue,
  replaceDocumentMarkers,
  replaceMarkers,
  slugMapBySource,
} from "./archive-markers";
import { newsFileHref } from "../src/lib/news-file-url";

const { news, newsPhoto, document, newsDocument } = schema;

/**
 * `drizzle-kit`/`src/db/client.ts` берут схему из `DB_SCHEMA` в момент
 * статического импорта — раньше, чем разберётся `--schema`. Поэтому здесь
 * свой postgres()+drizzle(), как в scripts/migrate.ts: search_path — только
 * из аргумента командной строки, `DB_SCHEMA` из .env игнорируется.
 */

type ArchiveRecord = {
  Заголовок: string;
  Дата: string;
  ДатаИсходная?: string;
  Раздел?: string;
  Анонс?: string;
  Текст?: string;
  /** Готовый HTML тела (этап 8, parse-archive.ts); санитизация — зона парсера. */
  ТекстHTML?: string;
  Обложка?: string;
  Галерея?: string[];
  Документы?: string[];
  Источник?: string;
  Якорь?: string;
};

type Section = "federation" | "referees" | null;

type MockNewsItem = (typeof allNews)[number];

// ───────────────────────── аргументы ─────────────────────────

function parseArgs(argv: string[]) {
  let source: string | undefined;
  let schemaArg: string | undefined;
  let dryRun = false;
  let limit: number | undefined;
  let replaceAll = false;
  let addOnly = false;
  let skipUploaded = false;
  let skipTitleDate = false;
  let allowDataLoss = false;
  let assets: string | undefined;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--replace-all") {
      replaceAll = true;
    } else if (arg === "--add-only") {
      addOnly = true;
    } else if (arg === "--skip-uploaded") {
      skipUploaded = true;
    } else if (arg === "--skip-title-date") {
      skipTitleDate = true;
    } else if (arg === "--allow-data-loss") {
      allowDataLoss = true;
    } else if (arg.startsWith("--source=")) {
      source = arg.slice("--source=".length);
    } else if (arg.startsWith("--assets=")) {
      assets = arg.slice("--assets=".length);
    } else if (arg.startsWith("--schema=")) {
      schemaArg = arg.slice("--schema=".length);
    } else if (arg.startsWith("--limit=")) {
      limit = Number(arg.slice("--limit=".length));
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  if (!source) {
    throw new Error("--source обязателен");
  }
  if (schemaArg !== "dev" && schemaArg !== "public") {
    throw new Error('--schema обязателен и должен быть "dev" или "public"');
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit должен быть положительным целым числом");
  }
  if (addOnly && replaceAll) {
    throw new Error("--add-only и --replace-all несовместимы: один добавляет, другой заменяет");
  }
  if (allowDataLoss && !replaceAll) {
    throw new Error("--allow-data-loss имеет смысл только вместе с --replace-all");
  }
  if (skipTitleDate && !addOnly) {
    throw new Error("--skip-title-date имеет смысл только вместе с --add-only");
  }

  // База относительных путей Обложка/Галерея/Документы; по умолчанию —
  // прежнее поведение (файлы рядом с news_export_local.json).
  return {
    source,
    schemaArg,
    dryRun,
    limit,
    replaceAll,
    addOnly,
    skipUploaded,
    skipTitleDate,
    allowDataLoss,
    assets: assets ?? source,
  };
}

const {
  source,
  schemaArg,
  dryRun,
  limit,
  replaceAll,
  addOnly,
  skipUploaded,
  skipTitleDate,
  allowDataLoss,
  assets,
} = parseArgs(process.argv.slice(2));

const modeName = replaceAll
  ? "полная замена (--replace-all)"
  : addOnly
    ? "только добавить (--add-only)"
    : "поштучно, перезапись при совпадении слага";

// ───────────────────────── подключение к БД (лениво) ─────────────────────────

/**
 * `--dry-run` обязан отрабатывать вообще без живой БД: соединение и проверка
 * `DATABASE_URL` откладываются до первого реального обращения из applyPlan,
 * которое при dryRun не наступает вовсе.
 *
 * Исключения (осознанные изменения инварианта), оба исполняют только SELECT:
 *   - `--dry-run` вместе с `--replace-all` — иначе не показать ни удаляемое,
 *     ни вердикт предохранителя (см. replaceAllDryRun);
 *   - `--dry-run` вместе с `--add-only` — иначе не показать, какие записи
 *     будут пропущены по совпадению слага, и не напечатать справку о
 *     совпадениях по «заголовок + дата».
 */
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
      ssl: sslFor(connectionString),
    });
    dbInstance = drizzle(sqlInstance, { schema });
  }
  return dbInstance;
}

// ───────────────────────── mock.ts: section/featured ─────────────────────────

function mockDateToIso(date: string): string {
  const [d, m, y] = date.split(".");
  return `20${y}-${m}-${d}`;
}

function mapCategoryToSection(category: MockNewsItem["category"]): Section {
  switch (category) {
    case "Федерация":
      return "federation";
    case "Коллегия судей":
      return "referees";
    case "Общее":
      return null;
    default: {
      const exhaustive: never = category;
      throw new Error(`Неизвестная категория mock.ts: ${String(exhaustive)}`);
    }
  }
}

const byNormalizedTitle = new Map<string, MockNewsItem[]>();
for (const item of allNews) {
  const key = normalizeTitle(item.title);
  const arr = byNormalizedTitle.get(key) ?? [];
  arr.push(item);
  byNormalizedTitle.set(key, arr);
}

const featuredOrderById = new Map(featuredNews.map((item, index) => [item.id, index]));

function matchMock(
  title: string,
  isoDate: string,
): { section: Section; featured: boolean; featuredOrder: number | null } | null {
  const candidates = byNormalizedTitle.get(normalizeTitle(title));
  if (!candidates || candidates.length === 0) {
    return null;
  }

  let matched: MockNewsItem;
  if (candidates.length === 1) {
    matched = candidates[0];
  } else {
    const sameDate = candidates.filter((c) => mockDateToIso(c.date) === isoDate);
    if (sameDate.length !== 1) {
      return null;
    }
    matched = sameDate[0];
  }

  const order = featuredOrderById.get(matched.id);
  return {
    section: mapCategoryToSection(matched.category),
    featured: order !== undefined,
    featuredOrder: order ?? null,
  };
}

// ───────────────────────── файлы ─────────────────────────

function imageContentType(ext: string, context: string): string {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      throw new Error(`Неизвестное расширение изображения "${ext}" (${context})`);
  }
}

function documentMimeType(ext: string, context: string): string {
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".rtf":
      return "application/rtf";
    case ".zip":
      return "application/zip";
    case ".rar":
      return "application/x-rar-compressed";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    default:
      throw new Error(`Неизвестное расширение документа "${ext}" (${context})`);
  }
}

function requireFile(localPath: string, context: string): void {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Файл не найден на диске: ${localPath} (${context})`);
  }
}

// ───────────────────────── размеры фото ─────────────────────────

/** Размеры кадра так, как его покажет браузер. */
type ImageSize = { width: number; height: number };

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
async function readImageSizes(records: ReadonlyArray<ArchiveRecord>): Promise<void> {
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
function sizeOf(localPath: string, context: string): ImageSize {
  const size = imageSizes.get(localPath);
  if (!size) {
    throw new Error(`Размер файла не прочитан: ${localPath} (${context})`);
  }
  return size;
}

// ───────────────────────── план записи ─────────────────────────

type Plan = {
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  section: Section;
  source: string | null;
  publishedAt: string;
  /** Явная отметка создания: порядок внутри дня повторяет ленту легаси. */
  createdAt: Date;
  featured: boolean;
  featuredOrder: number | null;
  mockMatched: boolean;
  cover: ({ localPath: string; s3Key: string; contentType: string } & ImageSize) | null;
  gallery: Array<
    { localPath: string; s3Key: string; contentType: string; position: number } & ImageSize
  >;
  galleryDroppedHttp: string[];
  documents: Array<{
    localPath: string;
    s3Key: string;
    mimeType: string;
    sizeBytes: number;
    position: number;
  }>;
};

/** Заголовок записи с той же проверкой, что в buildPlan (нужен пред-проходу). */
function titleOf(record: ArchiveRecord, slug: string): string {
  const title = record["Заголовок"]?.trim();
  if (!title) {
    throw new Error(`Запись без заголовка (slug="${slug}")`);
  }
  return title;
}

/** ISO-дата записи с той же проверкой, что в buildPlan (нужна пред-проходу). */
function isoDateOf(record: ArchiveRecord): string {
  const isoMatch = record["Дата"]?.match(/^\d{4}-\d{2}-\d{2}/);
  if (!isoMatch) {
    throw new Error(`Некорректная "Дата" у записи "${record["Заголовок"]}": ${record["Дата"]}`);
  }
  return isoMatch[0];
}

function buildPlan(record: ArchiveRecord, slug: string, createdAt: Date): Plan {
  const title = titleOf(record, slug);
  const publishedAt = isoDateOf(record);

  // При --replace-all и --add-only сопоставление с mock.ts отключено:
  // section/featured расставляются руками. На непустом боевом сайте моки
  // перебили бы выбранные человеком «главные новости» и столкнули бы
  // featured_order.
  const matched = replaceAll || addOnly ? null : matchMock(title, publishedAt);

  const cover = record["Обложка"]
    ? (() => {
        const localPath = path.join(assets, record["Обложка"]!);
        requireFile(localPath, `обложка новости "${title}"`);
        const ext = path.extname(localPath).toLowerCase();
        return {
          localPath,
          s3Key: `news/${slug}/cover${ext}`,
          contentType: imageContentType(ext, `обложка новости "${title}"`),
          ...sizeOf(localPath, `обложка новости "${title}"`),
        };
      })()
    : null;

  const galleryDroppedHttp: string[] = [];
  const galleryLocalItems: string[] = [];
  for (const item of record["Галерея"] ?? []) {
    if (/^https?:\/\//i.test(item)) {
      galleryDroppedHttp.push(item);
    } else {
      galleryLocalItems.push(item);
    }
  }
  const gallery = galleryLocalItems.map((item, idx) => {
    const localPath = path.join(assets, item);
    requireFile(localPath, `фото галереи новости "${title}"`);
    const ext = path.extname(localPath).toLowerCase();
    const nn = String(idx + 1).padStart(2, "0");
    return {
      localPath,
      s3Key: `news/${slug}/${nn}${ext}`,
      contentType: imageContentType(ext, `фото галереи новости "${title}"`),
      position: idx + 1,
      ...sizeOf(localPath, `фото галереи новости "${title}"`),
    };
  });

  const documents = (record["Документы"] ?? []).map((item, idx) => {
    if (/^https?:\/\//i.test(item)) {
      throw new Error(
        `Документ выглядит как http-ссылка, ожидался локальный путь: ${item} (новость "${title}")`,
      );
    }
    const localPath = path.join(assets, item);
    requireFile(localPath, `документ новости "${title}"`);
    const ext = path.extname(localPath).toLowerCase();
    // Имя файла — тем же правилом, что строит карту замены меток документов:
    // второй копии у него быть не должно, иначе метка уедет на чужой файл.
    const fileName = documentFileName(item, idx);
    return {
      localPath,
      s3Key: `news/${slug}/documents/${fileName}`,
      mimeType: documentMimeType(ext, `документ новости "${title}"`),
      sizeBytes: fs.statSync(localPath).size,
      position: idx + 1,
    };
  });

  return {
    slug,
    title,
    excerpt: record["Анонс"]?.trim() || null,
    // ТекстHTML кладётся как есть: санитизация — зона парсера (parse-archive.ts).
    body: record["ТекстHTML"] ?? (record["Текст"] ? textToHtml(record["Текст"]) : null),
    section: matched?.section ?? null,
    source: record["Источник"]?.trim() || null,
    publishedAt,
    createdAt,
    featured: matched?.featured ?? false,
    featuredOrder: matched?.featuredOrder ?? null,
    mockMatched: matched !== null,
    cover,
    gallery,
    galleryDroppedHttp,
    documents,
  };
}

// ───────────────────────── заливка файла ─────────────────────────

let s3Uploaded = 0;
let s3Reuploaded = 0;
let s3Skipped = 0;

/**
 * Единственное место, где байты уходят в бакет. При `--skip-uploaded` сначала
 * HEAD: объект того же размера повторно не заливается. Ошибка HEAD, не
 * являющаяся 404, пробрасывается — тихо заливать поверх при сетевом сбое
 * нельзя. Файл читается с диска только тогда, когда заливка действительно
 * состоится.
 */
async function putFile(key: string, localPath: string, contentType: string): Promise<void> {
  const localSize = fs.statSync(localPath).size;
  let remote: RemoteObject = null;
  if (skipUploaded) {
    try {
      remote = { size: (await headObject(key)).size };
    } catch (error) {
      if (!isS3NotFound(error)) {
        throw error;
      }
      remote = null;
    }
  }

  const decision = decideUpload({ skipUploaded, remote, localSize });
  if (decision === "skip") {
    s3Skipped += 1;
    return;
  }
  if (decision === "reupload-size-mismatch") {
    s3Reuploaded += 1;
    console.warn(
      `[warn] размер в бакете отличается: ${key} (бакет ${remote?.size ?? 0}, файл ${localSize}) — перезаливаю`,
    );
  }
  await uploadObject(key, fs.readFileSync(localPath), contentType);
  s3Uploaded += 1;
}

// ───────────────────────── применение плана ─────────────────────────

async function applyPlan(plan: Plan, insertOnly = false): Promise<void> {
  if (dryRun) {
    console.log(`[news] план: ${plan.slug}`);
    return;
  }

  const db = getDb();

  const existing = await db
    .select({ id: news.id })
    .from(news)
    .where(eq(news.slug, plan.slug))
    .limit(1);

  const values = {
    title: plan.title,
    excerpt: plan.excerpt,
    body: plan.body,
    section: plan.section,
    source: plan.source,
    publishedAt: plan.publishedAt,
    createdAt: plan.createdAt,
    status: "published" as const,
    deletedAt: null,
    featured: plan.featured,
    featuredOrder: plan.featuredOrder,
  };

  let newsId: string;
  const isNew = existing.length === 0;

  if (isNew) {
    const [inserted] = await db
      .insert(news)
      .values({ slug: plan.slug, ...values })
      .returning({ id: news.id });
    newsId = inserted.id;
    console.log(`[news] создана: ${plan.slug}`);
  } else {
    if (insertOnly) {
      // Сюда режим «только добавить» попасть не должен: слаг уже отсеян
      // разделением. Если попал — схема изменилась под нами, и молча
      // перезаписывать чужую новость нельзя.
      throw new Error(
        `--add-only: слаг ${plan.slug} появился в схеме после разделения — перезапись запрещена`,
      );
    }
    newsId = existing[0].id;
    await db
      .update(news)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(news.id, newsId));
    console.log(`[news] обновлена: ${plan.slug}`);
  }

  // Полная замена фото: удаляем все существующие — FK news.cover_photo_id
  // (ON DELETE SET NULL) сам обнулит ссылку на удалённую обложку.
  await db.delete(newsPhoto).where(eq(newsPhoto.newsId, newsId));

  let uploaded = 0;

  if (plan.cover) {
    await putFile(plan.cover.s3Key, plan.cover.localPath, plan.cover.contentType);
    uploaded += 1;
    const [photo] = await db
      .insert(newsPhoto)
      .values({
        newsId,
        s3Key: plan.cover.s3Key,
        position: 0,
        width: plan.cover.width,
        height: plan.cover.height,
      })
      .returning({ id: newsPhoto.id });
    await db.update(news).set({ coverPhotoId: photo.id }).where(eq(news.id, newsId));
  }

  for (const item of plan.gallery) {
    await putFile(item.s3Key, item.localPath, item.contentType);
    uploaded += 1;
    await db.insert(newsPhoto).values({
      newsId,
      s3Key: item.s3Key,
      position: item.position,
      width: item.width,
      height: item.height,
    });
  }

  // Документы: удаляем document-строки, привязанные к этой новости —
  // news_document подчищается каскадом (FK document_id → document.id).
  const existingDocIds = await db
    .select({ id: newsDocument.documentId })
    .from(newsDocument)
    .where(eq(newsDocument.newsId, newsId));
  if (existingDocIds.length > 0) {
    await db.delete(document).where(
      inArray(
        document.id,
        existingDocIds.map((row) => row.id),
      ),
    );
  }

  for (const item of plan.documents) {
    await putFile(item.s3Key, item.localPath, item.mimeType);
    const [docRow] = await db
      .insert(document)
      .values({
        title: plan.title,
        s3Key: item.s3Key,
        fileName: path.basename(item.s3Key),
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        section: plan.section,
        documentDate: plan.publishedAt,
        // Действующие документы архива: скрыты не статусом, а отсутствием
        // страницы-библиотеки (см. scripts/backfill-document-fields.ts —
        // тот же смысл для уже существующих строк).
        status: "published",
        inLibrary: true,
      })
      .returning({ id: document.id });
    await db
      .insert(newsDocument)
      .values({ newsId, documentId: docRow.id, position: item.position });
  }

  console.log(
    `[news] ${plan.slug}: файлов залито ${uploaded}, документов ${plan.documents.length}`,
  );
}

// ───────────────────────── --replace-all: полная замена ─────────────────────────

/** Фаза 1: заливка всех S3-объектов плана. PUT идемпотентен — повтор безопасен. */
async function uploadPlanObjects(plan: Plan): Promise<number> {
  let uploaded = 0;
  if (plan.cover) {
    await putFile(plan.cover.s3Key, plan.cover.localPath, plan.cover.contentType);
    uploaded += 1;
  }
  for (const item of plan.gallery) {
    await putFile(item.s3Key, item.localPath, item.contentType);
    uploaded += 1;
  }
  for (const item of plan.documents) {
    await putFile(item.s3Key, item.localPath, item.mimeType);
    uploaded += 1;
  }
  return uploaded;
}

/** Все строки news — без фильтра по статусу и deleted_at: слаг уникален для всех. */
async function loadExistingNews(): Promise<ExistingNewsRow[]> {
  const db = getDb();
  return await db
    .select({
      slug: news.slug,
      title: news.title,
      publishedAt: news.publishedAt,
      deletedAt: news.deletedAt,
    })
    .from(news)
    .orderBy(news.publishedAt, news.title);
}

/**
 * Справка о совпадениях по «заголовок + дата» под другим адресом. Печатается
 * всегда — и в сухом прогоне, и в боевом — в режимах --add-only и
 * --replace-all. На боевом сайте это пары «архивная новость и заведённая
 * руками»: решение по каждой принимает человек, глазами.
 */
function printTitleDateOverlap(
  existing: ReadonlyArray<ExistingNewsRow>,
  plans: ReadonlyArray<PlanIdentity>,
): void {
  const overlap = titleDateOverlap(existing, plans);
  console.log(`─── совпадения по «заголовок + дата» под другим адресом: ${overlap.length} ───`);
  if (overlap.length === 0) {
    console.log("  нет");
    return;
  }
  console.log("  Решение по каждой паре — глазами: возможно, новость уже заведена руками.");
  for (const o of overlap) {
    console.log(
      `  ${o.existing.publishedAt}  в базе «${o.existing.title}» (/news/${o.existing.slug})` +
        `  ←→  в выгрузке «${o.planTitle}» (/news/${o.planSlug})`,
    );
  }
}

/**
 * Предохранитель --replace-all: режим удаляет из схемы всё, поэтому новость,
 * которой нет в выгрузке, исчезнет безвозвратно. Критерий — слаг: он и адрес
 * /news/СЛАГ, и префикс ключей S3. Вызывается до любой записи, в том числе до
 * заливки объектов.
 */
function guardReplaceAll(
  existing: ReadonlyArray<ExistingNewsRow>,
  plans: ReadonlyArray<PlanIdentity>,
): void {
  const verdict = checkReplaceAllCoverage(existing, plans, allowDataLoss);
  console.log("─── replace-all: предохранитель ───");
  console.log(
    `Новостей в схеме, которых нет в экспорте (по слагу): ${verdict.missingBySlug.length}`,
  );
  for (const r of verdict.missingBySlug) {
    console.log(
      `  ${r.slug}  ${r.publishedAt}  «${r.title}»${r.deletedAt == null ? "" : "  [мягко удалена]"}`,
    );
  }
  console.log(`Справочно, по «заголовок + дата»: ${verdict.missingByTitleDate.length}`);
  for (const r of verdict.missingByTitleDate) {
    console.log(`  ${r.publishedAt}  «${r.title}»`);
  }

  if (verdict.bypassed) {
    console.warn("--allow-data-loss: потеря разрешена явно, продолжаю");
    return;
  }
  if (verdict.ok) {
    console.log("предохранитель: новостей вне экспорта нет");
    return;
  }
  console.error("Отказ: --replace-all удалит эти записи безвозвратно.");
  console.error("Повторить с --allow-data-loss, если потеря осознана.");
  process.exit(1);
}

/**
 * Полная замена контента целевой схемы. Двухфазно: сначала все S3-объекты
 * (вне транзакции — сбой оставляет базу нетронутой), затем одна транзакция
 * БД: DELETE всех строк news_document → news_photo → document → news
 * (порядок с учётом FK: cover_photo_id → news_photo гасится ON DELETE SET
 * NULL, news_document каскадится от обеих сторон) и все вставки. Сбой фазы
 * 2 — полный откат.
 */
async function replaceAllApply(plans: Plan[]): Promise<void> {
  let uploaded = 0;
  for (const plan of plans) {
    uploaded += await uploadPlanObjects(plan);
  }
  console.log(`Фаза 1 завершена: залито объектов S3: ${uploaded}`);

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(newsDocument);
    await tx.delete(newsPhoto);
    await tx.delete(document);
    await tx.delete(news);

    for (const plan of plans) {
      const [inserted] = await tx
        .insert(news)
        .values({
          slug: plan.slug,
          title: plan.title,
          excerpt: plan.excerpt,
          body: plan.body,
          section: plan.section,
          source: plan.source,
          publishedAt: plan.publishedAt,
          createdAt: plan.createdAt,
          status: "published" as const,
          featured: plan.featured,
          featuredOrder: plan.featuredOrder,
        })
        .returning({ id: news.id });
      const newsId = inserted.id;

      if (plan.cover) {
        const [photo] = await tx
          .insert(newsPhoto)
          .values({
            newsId,
            s3Key: plan.cover.s3Key,
            position: 0,
            width: plan.cover.width,
            height: plan.cover.height,
          })
          .returning({ id: newsPhoto.id });
        await tx.update(news).set({ coverPhotoId: photo.id }).where(eq(news.id, newsId));
      }
      for (const item of plan.gallery) {
        await tx.insert(newsPhoto).values({
          newsId,
          s3Key: item.s3Key,
          position: item.position,
          width: item.width,
          height: item.height,
        });
      }
      for (const item of plan.documents) {
        const [docRow] = await tx
          .insert(document)
          .values({
            title: plan.title,
            s3Key: item.s3Key,
            fileName: path.basename(item.s3Key),
            mimeType: item.mimeType,
            sizeBytes: item.sizeBytes,
            section: plan.section,
            documentDate: plan.publishedAt,
            status: "published",
            inLibrary: true,
          })
          .returning({ id: document.id });
        await tx
          .insert(newsDocument)
          .values({ newsId, documentId: docRow.id, position: item.position });
      }
    }
  });
  console.log(`Фаза 2 завершена: схема ${schemaArg} заменена, новостей ${plans.length}`);
}

/**
 * --dry-run вместе с --replace-all подключается к БД — осознанное изменение
 * инварианта «dry-run без БД» (см. комментарий у getDb): без живой базы не
 * показать ни удаляемое, ни coverage-check. Здесь исполняются ТОЛЬКО
 * SELECT-запросы — никакой записи.
 */
async function replaceAllDryRun(): Promise<void> {
  const db = getDb();

  const [[newsN], [photoN], [docN], [linkN]] = await Promise.all([
    db.select({ n: count() }).from(news),
    db.select({ n: count() }).from(newsPhoto),
    db.select({ n: count() }).from(document),
    db.select({ n: count() }).from(newsDocument),
  ]);
  console.log("─── replace-all dry-run: будет удалено ───");
  console.log(
    `news: ${newsN.n}, news_photo: ${photoN.n}, document: ${docN.n}, news_document: ${linkN.n}`,
  );

  const docTitles = await db
    .select({ title: document.title, fileName: document.fileName })
    .from(document)
    .orderBy(document.title, document.fileName);
  console.log(`document.title поимённо (${docTitles.length}):`);
  for (const d of docTitles) console.log(`  ${d.title} [${d.fileName}]`);
}

// ───────────────────────── main ─────────────────────────

async function main() {
  const jsonPath = path.join(source, "news_export_local.json");
  const allRecords: ArchiveRecord[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const records = limit !== undefined ? allRecords.slice(0, limit) : allRecords;

  console.log(`Хост: ${describeTarget(process.env.DATABASE_URL)}`);
  console.log(`Режим: ${modeName}`);
  console.log(
    `Записей в файле: ${allRecords.length}, обрабатывается: ${records.length} (schema=${schemaArg}, dry-run=${dryRun})`,
  );

  // Слаги и отметки created_at считаются по ПОЛНОМУ списку, рабочим берётся
  // префикс. На срезе (--limit) коллизия слага с записью за пределом среза не
  // видна: пилот создал бы строки под слагами, которых не будет при полном
  // прогоне, а метки указали бы на них же. Ранг created_at внутри дня по той
  // же причине считается по полному списку — и он, и слаг обязаны совпадать с
  // полным прогоном байт в байт.
  const allSlugs = resolveSlugs(allRecords);
  const allCreatedAt = createdAtByIndex(allRecords.map((r) => isoDateOf(r)));
  const slugs = allSlugs.slice(0, records.length);
  const createdAts = allCreatedAt.slice(0, records.length);

  // ── метки на архивные записи → адреса ──
  // Адрес записи знает только мигратор, поэтому разбор ставит в тело метку на
  // `Источник` целевой записи. Карта строится по ПОЛНОМУ списку записей, а не
  // по срезу `--limit`: иначе метка на запись за пределом среза молча стала бы
  // текстом.
  const slugBySource = slugMapBySource(
    allRecords.map((r) => r["Источник"]),
    allSlugs,
  );

  // Личности записей рабочего набора — всё, что нужно предохранителю и
  // справке, без единого обращения к диску.
  const identities = records.map((r, idx) => ({
    index: idx,
    slug: slugs[idx],
    title: titleOf(r, slugs[idx]),
    publishedAt: isoDateOf(r),
  }));

  // ── режим «только добавить»: что вставляем, что пропускаем ──
  // Фазы последовательны: сначала читается схема и принимаются ВСЕ решения,
  // и только потом хоть что-то пишется. У пропущенных записей не читается
  // диск и не заливается ни одного объекта.
  let working = identities;
  let skippedRows: Array<{
    item: (typeof identities)[number];
    reason: "active" | "soft-deleted" | "title-date";
    existing?: ExistingNewsRow;
  }> = [];

  if (addOnly || replaceAll) {
    const existing = await loadExistingNews();
    printTitleDateOverlap(existing, identities);
    if (replaceAll) {
      guardReplaceAll(existing, identities);
    }
    if (addOnly) {
      const bySlug = new Map(existing.map((r) => [r.slug, r]));
      // Ключ --skip-title-date: совпавшая по «заголовок + дата» запись
      // выгрузки пропускается целиком, на сайте остаётся версия схемы.
      // Без ключа карта не передаётся, и поведение прежнее: справка
      // печатается (printTitleDateOverlap выше), запись добавляется.
      const byTitleDate = skipTitleDate
        ? indexByTitleDate(existing, new Set(identities.map((i) => i.slug)))
        : undefined;
      const part = partitionAddOnly(identities, bySlug, byTitleDate);
      working = part.insert;
      skippedRows = part.skipped;
      console.log(
        `─── только добавить: пропущено ${skippedRows.length}` +
          (skipTitleDate ? "" : " (ключ --skip-title-date выключен)") +
          " ───",
      );
      for (const s of skippedRows) {
        const what =
          s.reason === "active"
            ? "новость уже есть"
            : s.reason === "soft-deleted"
              ? "есть МЯГКО УДАЛЁННАЯ новость"
              : `совпало «заголовок + дата» с /news/${s.existing?.slug ?? "?"} — пропущено, оставлена версия сайта`;
        console.log(`[skip] ${s.item.slug}: ${what} — «${s.item.title}» (${s.item.publishedAt})`);
      }
    }
  }

  const workingRecords = working.map((w) => records[w.index]);

  // Замена меток идёт по рабочему набору: тела пропущенных никуда не поедут,
  // и считать их в «меток заменено» было бы неправдой. Карта при этом полная,
  // поэтому ссылка на пропущенную запись всё равно разрешается в её адрес —
  // он в схеме и правда есть.
  let markersReplaced = 0;
  const markersDropped: string[] = [];
  for (const rec of workingRecords) {
    const body = rec["ТекстHTML"];
    if (body === undefined) continue;
    const res = replaceMarkers(body, slugBySource);
    rec["ТекстHTML"] = res.html;
    markersReplaced += res.replaced;
    for (const src of res.dropped) {
      markersDropped.push(`"${rec["Заголовок"]}": ${src}`);
    }
  }
  // Метки на приложенные документы. Карта строится на КАЖДУЮ запись отдельно,
  // по её собственному полю «Документы», поэтому метка физически не может
  // указать на документ чужой записи. Ключ хранилища тут ещё не посчитан
  // (это делает buildPlan), но он от buildPlan и не зависит: имя файла —
  // чистая функция от порядка пути в «Документы» и его расширения.
  let docMarkersReplaced = 0;
  const docMarkersDropped: string[] = [];
  for (const w of working) {
    const rec = records[w.index];
    const body = rec["ТекстHTML"];
    if (body === undefined) continue;
    const hrefByPath = documentHrefsByPath(rec["Документы"] ?? [], (fileName) =>
      newsFileHref(allSlugs[w.index], fileName),
    );
    const res = replaceDocumentMarkers(body, hrefByPath);
    rec["ТекстHTML"] = res.html;
    docMarkersReplaced += res.replaced;
    for (const путь of res.dropped) {
      docMarkersDropped.push(`"${rec["Заголовок"]}": ${путь}`);
    }
  }

  // Остаток схемы после замены означает, что форма метки разошлась с формой
  // замены: молча залить такое тело нельзя.
  const markerResidue = workingRecords.filter(
    (r) => r["ТекстHTML"] && hasMarkerResidue(r["ТекстHTML"]),
  );
  if (markerResidue.length > 0) {
    console.error(
      `Остаток метки ${RECORD_MARKER_SCHEME} после замены у ${markerResidue.length} записей:`,
    );
    for (const r of markerResidue) console.error(`  "${r["Заголовок"]}" (${r["Дата"]})`);
    process.exit(1);
  }
  const docMarkerResidue = workingRecords.filter(
    (r) => r["ТекстHTML"] && hasDocumentMarkerResidue(r["ТекстHTML"]),
  );
  if (docMarkerResidue.length > 0) {
    console.error(
      `Остаток метки ${DOCUMENT_MARKER_SCHEME} после замены у ${docMarkerResidue.length} записей:`,
    );
    for (const r of docMarkerResidue) console.error(`  "${r["Заголовок"]}" (${r["Дата"]})`);
    process.exit(1);
  }

  // Фаза размеров: ВСЕ фото рабочего набора промеряются до первой записи в
  // S3 и в базу. Пропущенные записи не промеряются — их файлы никуда не
  // поедут. Фаза идёт и в сухом прогоне: сухой прогон затем и нужен, чтобы
  // нечитаемый файл всплыл до боевой заливки.
  await readImageSizes(workingRecords);

  let coverCount = 0;
  let noCoverCount = 0;
  let galleryPhotoCount = 0;
  let droppedHttpCount = 0;
  let documentCount = 0;
  let mockNotFoundCount = 0;

  function noteAndPrintPlan(plan: Plan): void {
    if (!replaceAll && !addOnly && !plan.mockMatched) {
      mockNotFoundCount += 1;
      console.warn(`[warn] "${plan.title}": не найдено в mock.ts — section=null, featured=false`);
    }
    for (const dropped of plan.galleryDroppedHttp) {
      droppedHttpCount += 1;
      console.warn(`[warn] "${plan.title}": http-ссылка в галерее пропущена: ${dropped}`);
    }
    if (plan.cover) {
      coverCount += 1;
    } else {
      noCoverCount += 1;
      console.log(`[info] "${plan.title}": нет обложки`);
    }
    galleryPhotoCount += plan.gallery.length;
    documentCount += plan.documents.length;

    console.log(
      `[plan] ${plan.slug}: section=${plan.section ?? "null"} featured=${plan.featured}` +
        `(${plan.featuredOrder ?? "-"}) cover=${plan.cover ? "yes" : "no"} gallery=${plan.gallery.length} documents=${plan.documents.length}`,
    );
  }

  function printTotals(): void {
    console.log("───────────────────────────────────────");
    console.log(`Режим: ${modeName}`);
    console.log(`Обработано записей: ${working.length}`);
    if (addOnly) {
      const soft = skippedRows.filter((s) => s.reason === "soft-deleted").length;
      const byTitleDateCount = skippedRows.filter((s) => s.reason === "title-date").length;
      const bySlugCount = skippedRows.length - byTitleDateCount;
      console.log(
        (dryRun ? `К добавлению: ${working.length}` : `Добавлено новостей: ${working.length}`) +
          `, пропущено (слаг уже в схеме): ${bySlugCount}, из них мягко удалённых: ${soft}` +
          `, пропущено по «заголовок + дата»: ${byTitleDateCount}` +
          (skipTitleDate ? "" : " — ключ --skip-title-date выключен, пропусков быть не может"),
      );
    }
    console.log(`С обложкой: ${coverCount}, без обложки: ${noCoverCount}`);
    console.log(
      `Фото в галереях: ${galleryPhotoCount}, http-ссылок пропущено: ${droppedHttpCount}`,
    );
    console.log(`Документов: ${documentCount}`);
    console.log(
      `Меток заменено: ${markersReplaced}, снято (записи нет): ${markersDropped.length}` +
        (markersDropped.length ? ` — ${markersDropped.join("; ")}` : ""),
    );
    console.log(
      `Меток документов заменено: ${docMarkersReplaced}, снято (документа нет): ` +
        `${docMarkersDropped.length}` +
        (docMarkersDropped.length ? ` — ${docMarkersDropped.join("; ")}` : ""),
    );
    console.log(
      `Объектов S3: залито ${s3Uploaded}, из них перезалито по несовпадению размера ${s3Reuploaded}, ` +
        `пропущено (размер совпал): ${s3Skipped}` +
        (skipUploaded ? "" : " — ключ --skip-uploaded выключен, пропусков быть не может"),
    );
    if (!replaceAll && !addOnly) {
      console.log(`Не найдено в mock.ts: ${mockNotFoundCount}`);
    }
  }

  if (replaceAll) {
    // Все планы строятся (и валидируются: наличие файлов, mime, даты) ДО
    // любых действий с S3 и БД — сбой валидации не оставляет полуработы.
    const plans: Plan[] = [];
    for (const w of working) {
      const plan = buildPlan(records[w.index], w.slug, createdAts[w.index]);
      noteAndPrintPlan(plan);
      plans.push(plan);
    }
    if (dryRun) {
      printTotals();
      await replaceAllDryRun();
    } else {
      await replaceAllApply(plans);
      printTotals();
    }
  } else {
    for (const w of working) {
      const plan = buildPlan(records[w.index], w.slug, createdAts[w.index]);
      noteAndPrintPlan(plan);
      await applyPlan(plan, addOnly);
    }
    printTotals();
  }

  if (sqlInstance) {
    await sqlInstance.end();
  }
}

await main();
