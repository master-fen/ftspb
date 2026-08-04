import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { eq, inArray } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { TIMEWEB_CA } from "../src/db/ca";
import * as schema from "../src/db/schema";
import { allNews, featuredNews } from "../src/data/mock";
import { slugify } from "../src/server/slug";
import { uploadObject } from "../src/server/storage";

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

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--source=")) {
      source = arg.slice("--source=".length);
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

  return { source, schemaArg, dryRun, limit };
}

const { source, schemaArg, dryRun, limit } = parseArgs(process.argv.slice(2));

// ───────────────────────── подключение к БД (лениво) ─────────────────────────

/**
 * `--dry-run` обязан отрабатывать вообще без живой БД: соединение и проверка
 * `DATABASE_URL` откладываются до первого реального обращения из applyPlan,
 * которое при dryRun не наступает вовсе.
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
      ssl: { ca: TIMEWEB_CA, rejectUnauthorized: true },
    });
    dbInstance = drizzle(sqlInstance, { schema });
  }
  return dbInstance;
}

// ───────────────────────── mock.ts: section/featured ─────────────────────────

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

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
    default:
      throw new Error(`Неизвестное расширение документа "${ext}" (${context})`);
  }
}

function requireFile(localPath: string, context: string): void {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Файл не найден на диске: ${localPath} (${context})`);
  }
}

// ───────────────────────── план записи ─────────────────────────

type Plan = {
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  section: Section;
  publishedAt: string;
  featured: boolean;
  featuredOrder: number | null;
  mockMatched: boolean;
  cover: { localPath: string; s3Key: string; contentType: string } | null;
  gallery: Array<{ localPath: string; s3Key: string; contentType: string; position: number }>;
  galleryDroppedHttp: string[];
  documents: Array<{
    localPath: string;
    s3Key: string;
    mimeType: string;
    sizeBytes: number;
    position: number;
  }>;
};

function buildPlan(record: ArchiveRecord, slug: string): Plan {
  const title = record["Заголовок"]?.trim();
  if (!title) {
    throw new Error(`Запись без заголовка (slug="${slug}")`);
  }

  const isoMatch = record["Дата"]?.match(/^\d{4}-\d{2}-\d{2}/);
  if (!isoMatch) {
    throw new Error(`Некорректная "Дата" у записи "${title}": ${record["Дата"]}`);
  }
  const publishedAt = isoMatch[0];

  const matched = matchMock(title, publishedAt);

  const cover = record["Обложка"]
    ? (() => {
        const localPath = path.join(source, record["Обложка"]!);
        requireFile(localPath, `обложка новости "${title}"`);
        const ext = path.extname(localPath).toLowerCase();
        return {
          localPath,
          s3Key: `news/${slug}/cover${ext}`,
          contentType: imageContentType(ext, `обложка новости "${title}"`),
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
    const localPath = path.join(source, item);
    requireFile(localPath, `фото галереи новости "${title}"`);
    const ext = path.extname(localPath).toLowerCase();
    const nn = String(idx + 1).padStart(2, "0");
    return {
      localPath,
      s3Key: `news/${slug}/${nn}${ext}`,
      contentType: imageContentType(ext, `фото галереи новости "${title}"`),
      position: idx + 1,
    };
  });

  const documents = (record["Документы"] ?? []).map((item, idx) => {
    if (/^https?:\/\//i.test(item)) {
      throw new Error(
        `Документ выглядит как http-ссылка, ожидался локальный путь: ${item} (новость "${title}")`,
      );
    }
    const localPath = path.join(source, item);
    requireFile(localPath, `документ новости "${title}"`);
    const ext = path.extname(localPath).toLowerCase();
    const nn = String(idx + 1).padStart(2, "0");
    return {
      localPath,
      s3Key: `news/${slug}/documents/${nn}${ext}`,
      mimeType: documentMimeType(ext, `документ новости "${title}"`),
      sizeBytes: fs.statSync(localPath).size,
      position: idx + 1,
    };
  });

  return {
    slug,
    title,
    excerpt: record["Анонс"]?.trim() || null,
    body: record["Текст"] || null,
    section: matched?.section ?? null,
    publishedAt,
    featured: matched?.featured ?? false,
    featuredOrder: matched?.featuredOrder ?? null,
    mockMatched: matched !== null,
    cover,
    gallery,
    galleryDroppedHttp,
    documents,
  };
}

// ───────────────────────── применение плана ─────────────────────────

async function applyPlan(plan: Plan): Promise<void> {
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
    publishedAt: plan.publishedAt,
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
    const body = fs.readFileSync(plan.cover.localPath);
    await uploadObject(plan.cover.s3Key, body, plan.cover.contentType);
    uploaded += 1;
    const [photo] = await db
      .insert(newsPhoto)
      .values({ newsId, s3Key: plan.cover.s3Key, position: 0 })
      .returning({ id: newsPhoto.id });
    await db.update(news).set({ coverPhotoId: photo.id }).where(eq(news.id, newsId));
  }

  for (const item of plan.gallery) {
    const body = fs.readFileSync(item.localPath);
    await uploadObject(item.s3Key, body, item.contentType);
    uploaded += 1;
    await db.insert(newsPhoto).values({ newsId, s3Key: item.s3Key, position: item.position });
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
    const body = fs.readFileSync(item.localPath);
    await uploadObject(item.s3Key, body, item.mimeType);
    const [docRow] = await db
      .insert(document)
      .values({
        title: plan.title,
        s3Key: item.s3Key,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        section: plan.section,
        documentDate: plan.publishedAt,
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

// ───────────────────────── slug: коллизии ─────────────────────────

function resolveSlugs(records: ArchiveRecord[]): string[] {
  const baseSlugs = records.map((r) => slugify(r["Заголовок"] ?? ""));
  const groups = new Map<string, number[]>();
  baseSlugs.forEach((base, i) => {
    const arr = groups.get(base) ?? [];
    arr.push(i);
    groups.set(base, arr);
  });

  const finalSlugs = new Array<string>(records.length);
  for (const [base, indices] of groups) {
    if (indices.length === 1) {
      finalSlugs[indices[0]] = base;
      continue;
    }
    for (const i of indices) {
      const isoMatch = records[i]["Дата"]?.match(/^\d{4}-\d{2}-\d{2}/);
      if (!isoMatch) {
        throw new Error(`Некорректная "Дата" у записи "${records[i]["Заголовок"]}"`);
      }
      finalSlugs[i] = `${base}-${isoMatch[0]}`;
    }
  }

  const seen = new Set<string>();
  for (const s of finalSlugs) {
    if (seen.has(s)) {
      throw new Error(`Дублирующийся slug после разрешения коллизии: ${s}`);
    }
    seen.add(s);
  }

  return finalSlugs;
}

// ───────────────────────── main ─────────────────────────

async function main() {
  const jsonPath = path.join(source, "news_export_local.json");
  const allRecords: ArchiveRecord[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const records = limit !== undefined ? allRecords.slice(0, limit) : allRecords;

  console.log(
    `Записей в файле: ${allRecords.length}, обрабатывается: ${records.length} (schema=${schemaArg}, dry-run=${dryRun})`,
  );

  const slugs = resolveSlugs(records);

  let coverCount = 0;
  let noCoverCount = 0;
  let galleryPhotoCount = 0;
  let droppedHttpCount = 0;
  let documentCount = 0;
  let mockNotFoundCount = 0;

  for (let i = 0; i < records.length; i++) {
    const plan = buildPlan(records[i], slugs[i]);

    if (!plan.mockMatched) {
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

    await applyPlan(plan);
  }

  console.log("───────────────────────────────────────");
  console.log(`Обработано записей: ${records.length}`);
  console.log(`С обложкой: ${coverCount}, без обложки: ${noCoverCount}`);
  console.log(`Фото в галереях: ${galleryPhotoCount}, http-ссылок пропущено: ${droppedHttpCount}`);
  console.log(`Документов: ${documentCount}`);
  console.log(`Не найдено в mock.ts: ${mockNotFoundCount}`);

  if (sqlInstance) {
    await sqlInstance.end();
  }
}

await main();
