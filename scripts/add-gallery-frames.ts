/**
 * Адресная операция на уже залитом сайте: дописать кадры галерей к существующим
 * новостям и поправить их тело (снять ссылки на страницы старых галерей).
 * `--replace-all` и `reset:archive` на боевом запрещены; эта операция трогает
 * только новости, у которых различаются прежняя и новая выгрузки, и только
 * если в базе они ровно такие, какими их залила прежняя выгрузка.
 *
 * Режимы (первая строка вывода называет цель и режим):
 *   сухой прогон  --dry-run   только SELECT и HEAD, ничего не пишет;
 *   запись        (без --dry-run) сначала файл отката, потом по новости:
 *                 все объекты хранилища, затем одна транзакция базы;
 *   откат         --rollback=ФАЙЛ   по файлу, который записала операция.
 *
 * Запуск (bun; `DATABASE_URL` и `S3_*` — из окружения, как у migrate:archive):
 *   bun run scripts/add-gallery-frames.ts --schema=public \
 *     --new=D:\Webarchive\compressed-gallery --base=D:\Webarchive\compressed \
 *     --backup=D:\Webarchive\gallery-op [--dry-run] [--only=СЛАГ]
 *   bun run scripts/add-gallery-frames.ts --schema=public --rollback=ФАЙЛ [--dry-run]
 *
 * `--new` и `--base` — папки сжатых выгрузок (`compress-archive.ts`): новая и
 * та, с которой залит сайт. Ключи хранилища и position считаются так же, как у
 * мигратора (`news/СЛАГ/NN.ext`, обложка `cover.ext`), поэтому после операции
 * эти новости выглядят так, как выглядели бы после полной заливки новой
 * выгрузки. Чистая логика — в `archive-gallery-ops.ts`, там же тесты.
 *
 * `--stub-s3=ПАПКА` — репетиция: хранилище заменено папкой на диске; допустим
 * только при локальной базе. Перезаписи объектов нет никогда: чужой объект под
 * нашим ключом — стоп по новости.
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";
import { describeTarget, isLocalHost, sslFor } from "../src/db/ssl";
import { deleteObject, headObject, isS3NotFound, uploadObject } from "../src/server/storage";
import { readImageSizes, sizeOf } from "./archive-image-sizes";
import { imageContentType, resolveSlugs } from "./archive-migration-rules";
import { retryStorage, writeRecordAtomically, type RecordObject } from "./archive-record-write";
import {
  type CliConfig,
  type DbNews,
  type ExportRecord,
  type NewsChange,
  type ObjectDecision,
  type RollbackFile,
  type RollbackItem,
  buildChanges,
  checkRollbackTarget,
  classifyState,
  decideObject,
  headerLine,
  mayDeleteObject,
  parseCliArgs,
  parseRollbackFile,
  rollbackAction,
} from "./archive-gallery-ops";

const EXPORT_NAME = "news_export_local.json";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// ───────────────────────── хранилище (настоящее или папка-заглушка) ─────────────────────────

type Remote = { size: number; etag: string };
type Storage = {
  head(key: string): Promise<Remote | null>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  del(key: string): Promise<void>;
};

const realStorage: Storage = {
  async head(key) {
    try {
      return await retryStorage(() => headObject(key));
    } catch (error) {
      if (isS3NotFound(error)) return null;
      throw error;
    }
  },
  put: (key, body, contentType) => uploadObject(key, body, contentType),
  del: (key) => deleteObject(key),
};

/** Папка вместо бакета: ETag — md5 содержимого, как у одиночной заливки в S3. */
function stubStorage(dir: string): Storage {
  const file = (key: string) => path.join(dir, ...key.split("/"));
  return {
    async head(key) {
      const p = file(key);
      if (!fs.existsSync(p)) return null;
      const bytes = fs.readFileSync(p);
      return { size: bytes.length, etag: createHash("md5").update(bytes).digest("hex") };
    },
    async put(key, body) {
      fs.mkdirSync(path.dirname(file(key)), { recursive: true });
      fs.writeFileSync(file(key), body);
    },
    async del(key) {
      fs.rmSync(file(key), { force: true });
    },
  };
}

// ───────────────────────── разбор аргументов и подключение ─────────────────────────

const databaseUrl = process.env.DATABASE_URL;
let urlIsLocal = false;
try {
  urlIsLocal = databaseUrl ? isLocalHost(databaseUrl) : false;
} catch {
  urlIsLocal = false;
}

const parsed = parseCliArgs(process.argv.slice(2), urlIsLocal);
if (!parsed.ok) fail(parsed.error);
const config: CliConfig = parsed.config;

const target = describeTarget(databaseUrl);
console.log(headerLine(target, config.schema, config.mode));
if (config.mode === "откат" && config.dryRun) {
  console.log("(откат в режиме --dry-run: ничего не записано и не удалено)");
}
if (!databaseUrl) fail("DATABASE_URL не задан");

const sql = postgres(databaseUrl, {
  max: 1,
  connection: { search_path: config.schema },
  ssl: sslFor(databaseUrl),
});
const storage: Storage = config.stubS3Dir ? stubStorage(config.stubS3Dir) : realStorage;

const kib = (n: number): string => `${(n / 1024).toFixed(1)} КиБ`;
const pad = (n: number): string => String(n).padStart(2, "0");
const stamp = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// ───────────────────────── чтение состояния базы ─────────────────────────

async function loadDbNews(
  q: postgres.TransactionSql,
  change: NewsChange,
): Promise<{ db: DbNews | null; found: number }> {
  const rows = await q`
    select id, slug, status, deleted_at, body, source, cover_photo_id
    from news where published_at = ${change.date} and title = ${change.title}`;
  if (rows.length !== 1) return { db: null, found: rows.length };
  const row = rows[0];
  const photos = await q`
    select id, s3_key, position from news_photo where news_id = ${row.id} order by position`;
  return {
    found: 1,
    db: {
      id: row.id as string,
      slug: row.slug as string,
      status: row.status as string,
      deletedAt: (row.deleted_at as Date | null) ?? null,
      body: (row.body as string | null) ?? null,
      source: (row.source as string | null) ?? null,
      coverPhotoId: (row.cover_photo_id as string | null) ?? null,
      photos: photos.map((p) => ({
        id: p.id as string,
        key: p.s3_key as string,
        position: p.position as number,
      })),
    },
  };
}

// ───────────────────────── план записи ─────────────────────────

type Photo = {
  key: string;
  position: number;
  isCover: boolean;
  localPath: string;
  contentType: string;
  bytes: number;
  width: number;
  height: number;
  rowId: string;
  decision: ObjectDecision;
  remote: Remote | null;
};

type WorkItem = {
  change: NewsChange;
  db: DbNews;
  photos: Photo[];
  linksBefore: number;
  linksAfter: number;
};

const galleryLinks = (html: string): number => (html.match(/photogallery_/g) ?? []).length;

function loadExport(dir: string): ExportRecord[] {
  const file = path.join(dir, EXPORT_NAME);
  if (!fs.existsSync(file)) fail(`нет файла выгрузки: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as ExportRecord[];
}

async function planPhase(): Promise<{
  work: WorkItem[];
  skipped: number;
  done: number;
  total: number;
}> {
  const next = loadExport(config.newDir);
  const base = loadExport(config.baseDir);
  const slugs = resolveSlugs(next as Parameters<typeof resolveSlugs>[0]);
  const baseSlugs = resolveSlugs(base as Parameters<typeof resolveSlugs>[0]);
  let changes: NewsChange[];
  try {
    changes = buildChanges(base, next, slugs, baseSlugs);
  } catch (error) {
    fail(`разность выгрузок отклонена: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (config.only !== undefined) {
    changes = changes.filter((c) => c.slug === config.only);
    if (changes.length === 0) fail(`--only=${config.only}: такой новости нет среди изменений`);
  }
  console.log(`Изменений по разности выгрузок: ${changes.length}`);

  // Размеры всех дописываемых кадров читаются до первой записи (как у мигратора).
  const toSize = changes.flatMap((c) => c.addPhotos);
  await readImageSizes(
    toSize.map((p) => ({ Галерея: [p.exportPath] })),
    config.newDir,
  );

  const work: WorkItem[] = [];
  let skipped = 0;
  let done = 0;
  await sql.begin("read only", async (q) => {
    for (const change of changes) {
      const { db, found } = await loadDbNews(q, change);
      const verdict = classifyState(change, db, found);
      const url = `/news/${change.slug}`;
      if (verdict.kind === "уже сделано") {
        done += 1;
        console.log(`[уже сделано] ${url}`);
        continue;
      }
      if (verdict.kind === "расходится" || db === null) {
        skipped += 1;
        const reasons = verdict.kind === "расходится" ? verdict.reasons : ["нет строки"];
        console.log(`[пропуск] ${url} | ${reasons.join("; ")}`);
        continue;
      }
      const photos: Photo[] = [];
      let stop: string | null = null;
      for (const p of change.addPhotos) {
        const localPath = path.join(config.newDir, p.exportPath);
        if (!fs.existsSync(localPath)) {
          stop = `нет файла ${localPath}`;
          break;
        }
        const ext = path.extname(localPath).toLowerCase();
        const bytes = fs.statSync(localPath).size;
        const remote = await storage.head(p.key);
        const decision = decideObject(remote, bytes);
        if (decision.action === "стоп") {
          stop = `${p.key}: ${decision.reason}`;
          break;
        }
        photos.push({
          key: p.key,
          position: p.position,
          isCover: p.isCover,
          localPath,
          contentType: imageContentType(ext, `кадр ${p.key}`),
          bytes,
          ...sizeOf(localPath, `кадр ${p.key}`),
          rowId: randomUUID(),
          decision,
          remote,
        });
      }
      if (stop !== null) {
        skipped += 1;
        console.log(`[пропуск] ${url} | ${stop}`);
        continue;
      }
      const item: WorkItem = {
        change,
        db,
        photos,
        linksBefore: galleryLinks(change.oldBody),
        linksAfter: galleryLinks(change.newBody),
      };
      work.push(item);
      const fresh = photos.filter((p) => p.decision.action === "залить").length;
      const first = photos[0];
      const last = photos[photos.length - 1];
      console.log(
        `[к записи] ${url} | тело совпало | фото в базе ${db.photos.length} = выгрузке | ` +
          (photos.length > 0
            ? `+${photos.length} кадров: ${path.posix.basename(first.key)}…${path.posix.basename(last.key)} ` +
              `(position ${first.position}…${last.position}) | объектов новых ${fresh}, уже есть ${photos.length - fresh} | ` +
              `+${kib(photos.reduce((n, p) => n + p.bytes, 0))} | `
            : "без новых кадров | ") +
          `ссылок на галереи в теле ${item.linksBefore} → ${item.linksAfter}` +
          (change.oldSource !== change.newSource
            ? ` | source ${change.oldSource} → ${change.newSource}`
            : ""),
      );
    }
  });
  const frames = work.reduce((n, w) => n + w.photos.length, 0);
  const bytes = work.reduce((n, w) => n + w.photos.reduce((m, p) => m + p.bytes, 0), 0);
  console.log(
    `Итого: к записи ${work.length} новостей, ${frames} кадров, ${bytes} Б (${kib(bytes)}); ` +
      `пропущено ${skipped}; уже сделано ${done}.`,
  );
  return { work, skipped, done, total: changes.length };
}

// ───────────────────────── запись ─────────────────────────

function rollbackFileOf(work: WorkItem[]): RollbackFile {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    target,
    schema: config.schema,
    items: work.map(
      (w): RollbackItem => ({
        id: w.db.id,
        slug: w.change.slug,
        oldBody: w.change.oldBody,
        newBody: w.change.newBody,
        oldSource: w.change.oldSource,
        newSource: w.change.newSource,
        oldCoverPhotoId: w.db.coverPhotoId,
        rows: w.photos.map((p) => ({
          id: p.rowId,
          key: p.key,
          position: p.position,
          width: p.width,
          height: p.height,
          isCover: p.isCover,
        })),
        objects: w.photos.map((p) => ({
          key: p.key,
          created: p.decision.action === "залить",
          size: p.remote?.size ?? null,
          etag: p.remote?.etag ?? null,
        })),
        applied: false,
      }),
    ),
  };
}

async function writePhase(work: WorkItem[]): Promise<void> {
  if (work.length === 0) return;
  const dir = config.backupDir as string;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollback-${config.schema}-${stamp(new Date())}.json`);
  const rollback = rollbackFileOf(work);
  const save = () => fs.writeFileSync(file, JSON.stringify(rollback, null, 2), "utf-8");
  save();
  console.log(`Файл отката: ${file}`);

  let applied = 0;
  for (const [i, w] of work.entries()) {
    const item = rollback.items[i];
    const objects: RecordObject[] = w.photos
      .filter((p) => p.decision.action === "залить")
      .map((p) => ({
        key: p.key,
        localPath: p.localPath,
        contentType: p.contentType,
        kind: "photo",
      }));
    const outcome = await writeRecordAtomically(objects, {
      putObject: async (o) => {
        await retryStorage(() => storage.put(o.key, fs.readFileSync(o.localPath), o.contentType), {
          onRetry: ({ attempt, total, pauseMs, error }) =>
            console.warn(
              `[retry] PUT ${o.key}: попытка ${attempt} из ${total} через ${pauseMs / 1000} с — ${error instanceof Error ? error.message : String(error)}`,
            ),
        });
        const after = await storage.head(o.key);
        const entry = item.objects.find((x) => x.key === o.key);
        if (!after || !entry) throw new Error(`после заливки объекта ${o.key} HEAD не нашёл его`);
        entry.size = after.size;
        entry.etag = after.etag;
        save();
      },
      writeRows: () =>
        sql.begin(async (tx) => {
          const upd = await tx`
            update news set body = ${w.change.newBody}, source = ${w.change.newSource}
            where id = ${w.db.id} and body = ${w.change.oldBody}
              and source is not distinct from ${w.change.oldSource}
            returning id`;
          if (upd.length !== 1) throw new Error("новость изменилась между планом и записью");
          for (const p of w.photos) {
            await tx`
              insert into news_photo (id, news_id, s3_key, position, width, height)
              values (${p.rowId}, ${w.db.id}, ${p.key}, ${p.position}, ${p.width}, ${p.height})`;
            if (p.isCover) {
              await tx`update news set cover_photo_id = ${p.rowId} where id = ${w.db.id} and cover_photo_id is null`;
            }
          }
        }),
    });
    if (!outcome.ok) {
      const where =
        outcome.phase === "objects" ? `заливка объекта ${outcome.objectKey}` : "транзакция базы";
      const reason = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
      console.error(
        `Прогон остановлен на новости ${w.change.slug} (${applied} из ${work.length} записано): ${where}: ${reason}`,
      );
      console.error(
        `Файл отката: ${file}. Повтор безопасен: записанные новости получат «уже сделано».`,
      );
      process.exit(1);
    }
    item.applied = true;
    save();
    applied += 1;
    console.log(
      `[записано] /news/${w.change.slug}: кадров ${w.photos.length}, залито объектов ${outcome.counts.photos}`,
    );
  }
  console.log(`Записано новостей: ${applied} из ${work.length}. Файл отката: ${file}`);
}

// ───────────────────────── откат ─────────────────────────

async function rollbackPhase(): Promise<void> {
  const file = parseRollbackFile(fs.readFileSync(config.rollbackFile as string, "utf-8"));
  const refusal = checkRollbackTarget(file, { target, schema: config.schema });
  if (refusal !== null) fail(refusal);
  console.log(
    `Файл отката: ${config.rollbackFile}, новостей ${file.items.length}, создан ${file.createdAt}`,
  );

  let reverted = 0;
  let deleted = 0;
  for (const item of file.items) {
    const rows = await sql`select body, source from news where id = ${item.id}`;
    const ids = item.rows.map((r) => r.id);
    const present =
      ids.length > 0
        ? await sql`select id from news_photo where news_id = ${item.id} and id in ${sql(ids)}`
        : [];
    const db =
      rows.length === 1
        ? {
            body: (rows[0].body as string | null) ?? null,
            source: (rows[0].source as string | null) ?? null,
            presentRowIds: present.map((r) => r.id as string),
          }
        : null;
    const action = rollbackAction(item, db);
    const url = `/news/${item.slug}`;
    if (action.kind === "расходится") {
      console.log(`[пропуск] ${url} | ${action.reason}; объекты не трогаются`);
      continue;
    }
    if (action.kind === "откатить") {
      if (config.dryRun) {
        console.log(
          `[откатил бы] ${url}: тело и source возвращаются, строк news_photo к удалению ${ids.length}`,
        );
      } else {
        await sql.begin(async (tx) => {
          const upd = await tx`
            update news set body = ${item.oldBody}, source = ${item.oldSource},
              cover_photo_id = ${item.oldCoverPhotoId}
            where id = ${item.id} and body = ${item.newBody}
            returning id`;
          if (upd.length !== 1) throw new Error("новость изменилась во время отката");
          if (ids.length > 0) {
            await tx`delete from news_photo where news_id = ${item.id} and id in ${tx(ids)}`;
          }
        });
        reverted += 1;
        console.log(`[откачено] ${url}: тело, source, строк news_photo ${ids.length}`);
      }
    } else {
      console.log(`[уже откачено] ${url}`);
    }
    // Объекты — только после базы и только те, что залила операция.
    for (const o of item.objects) {
      const remote = await storage.head(o.key);
      // Ссылки — по обеим схемам: бакет общий, ключ мог достаться и `dev`, и `public`.
      const [pub] =
        await sql`select count(*)::int as n from public.news_photo where s3_key = ${o.key}`;
      const [dev] =
        await sql`select count(*)::int as n from dev.news_photo where s3_key = ${o.key}`;
      const removal = mayDeleteObject({
        created: o.created,
        fileEtag: o.etag,
        fileSize: o.size,
        remote,
        // В сухом прогоне строки этой же новости ещё на месте — их удалил бы сам откат.
        referencedByRows:
          (pub.n as number) +
          (dev.n as number) -
          (config.dryRun && action.kind === "откатить"
            ? item.rows.filter((r) => r.key === o.key).length
            : 0),
      });
      if (!removal.delete) {
        console.log(`  [объект оставлен] ${o.key}: ${removal.reason}`);
        continue;
      }
      if (config.dryRun) {
        console.log(`  [удалил бы объект] ${o.key}`);
        continue;
      }
      await retryStorage(() => storage.del(o.key));
      deleted += 1;
      console.log(`  [объект удалён] ${o.key}`);
    }
  }
  console.log(
    `Откат: новостей ${reverted}, объектов удалено ${deleted}${config.dryRun ? " (сухой прогон)" : ""}.`,
  );
}

// ───────────────────────── main ─────────────────────────

try {
  if (config.mode === "откат") {
    await rollbackPhase();
  } else {
    const plan = await planPhase();
    if (config.mode === "запись") await writePhase(plan.work);
  }
} finally {
  await sql.end();
}
