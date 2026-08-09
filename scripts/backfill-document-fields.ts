import path from "node:path";
import process from "node:process";
import { and, eq, isNull, or } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { TIMEWEB_CA } from "../src/db/ca";
import * as schema from "../src/db/schema";

const { document } = schema;

/**
 * Раунд 1 фазовой миграции document (см. CLAUDE.md/план этапа 6) добавил
 * file_name/status/in_library как nullable. Этот скрипт заполняет их для
 * существующих строк (архивные документы, залитые scripts/migrate-archive.ts
 * до появления этих колонок) — раунд 2 (SET NOT NULL) генерируется только
 * после того, как бэкофилл отработал на ОБЕИХ схемах, иначе migrate.ts
 * применит SET NOT NULL раньше бэкофилла и упадёт на NULL-строках.
 *
 * fileName физически неоткуда взять точнее: uploadObject() не сохраняет
 * оригинальное имя файла ни в Metadata, ни в БД — единственное реальное
 * значение это basename ключа S3 (у всех архивных документов буквально
 * "01.pdf"). status='published'/inLibrary=true — те же архивные документы
 * остаются действующими, их не должно молча вырезать из «Прикреплённые
 * файлы» после следующего PR.
 *
 * Как и dedupe-cover.ts: свой postgres()+drizzle(), search_path только из
 * --schema (DB_SCHEMA из .env игнорируется), не импортирует src/db/client.ts.
 */

// ───────────────────────── аргументы ─────────────────────────

function parseArgs(argv: string[]) {
  let schemaArg: string | undefined;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--schema=")) {
      schemaArg = arg.slice("--schema=".length);
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  if (schemaArg !== "dev" && schemaArg !== "public") {
    throw new Error('--schema обязателен и должен быть "dev" или "public"');
  }

  return { schemaArg, dryRun };
}

const { schemaArg, dryRun } = parseArgs(process.argv.slice(2));

// ───────────────────────── подключение к БД ─────────────────────────

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL не задан");
}

const sqlInstance = postgres(connectionString, {
  max: 1,
  connection: { search_path: schemaArg },
  ssl: { ca: TIMEWEB_CA, rejectUnauthorized: true },
});
const db: PostgresJsDatabase<typeof schema> = drizzle(sqlInstance, { schema });

// ───────────────────────── типы ─────────────────────────

type DocumentRow = {
  id: string;
  s3Key: string;
  fileName: string | null;
  status: "draft" | "published" | null;
  inLibrary: boolean | null;
};

type Plan = { id: string; s3Key: string; fileName: string };

// ───────────────────────── фаза A: предполётная проверка ─────────────────────────

/** Проверяет ВСЕ незаполненные строки и только потом возвращает план — см.
 * память проекта "скрипт-фазы должны быть последовательными". */
async function preflight(): Promise<Plan[]> {
  const rows: DocumentRow[] = await db
    .select({
      id: document.id,
      s3Key: document.s3Key,
      fileName: document.fileName,
      status: document.status,
      inLibrary: document.inLibrary,
    })
    .from(document)
    .where(or(isNull(document.fileName), isNull(document.status), isNull(document.inLibrary)));

  return rows.map((row) => ({
    id: row.id,
    s3Key: row.s3Key,
    fileName: path.basename(row.s3Key),
  }));
}

// ───────────────────────── фаза B: обработка ─────────────────────────

async function applyPlan(plans: Plan[]): Promise<void> {
  for (const plan of plans) {
    // eq(id) + повтор условия IS NULL — идемпотентно: перезапуск после
    // частичного сбоя не тронет уже заполненные строки.
    await db
      .update(document)
      .set({ fileName: plan.fileName, status: "published", inLibrary: true })
      .where(
        and(
          eq(document.id, plan.id),
          or(isNull(document.fileName), isNull(document.status), isNull(document.inLibrary)),
        ),
      );
  }
}

// ───────────────────────── main ─────────────────────────

async function main() {
  console.log(
    `Бэкофилл document.fileName/status/inLibrary (schema=${schemaArg}, dry-run=${dryRun})`,
  );

  const plans = await preflight();

  if (plans.length === 0) {
    console.log("Незаполненных строк нет — нечего делать.");
    await sqlInstance.end();
    return;
  }

  console.log(`Незаполненных строк: ${plans.length}`);
  for (const plan of plans) {
    console.log(
      `  [plan] id=${plan.id} s3Key=${plan.s3Key} → fileName=${plan.fileName}, status=published, inLibrary=true`,
    );
  }

  if (dryRun) {
    console.log("--dry-run: изменения не вносились.");
    await sqlInstance.end();
    return;
  }

  await applyPlan(plans);

  console.log(`Обновлено строк: ${plans.length}`);
  await sqlInstance.end();
}

await main();
