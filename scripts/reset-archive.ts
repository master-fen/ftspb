/**
 * Снятие архива с ЛОКАЛЬНОЙ схемы: приводит её к состоянию «новости редактора
 * без архива». Нужно перед повторной заливкой архива — `--add-only` пропускает
 * по слагу всё, что уже залито, и проверять после перезаливки было бы нечего.
 *
 * Запуск (сухой прогон — по умолчанию, ничего не меняет):
 *   bun run reset:archive --schema=dev
 * Выполнение:
 *   bun run reset:archive --schema=dev --yes
 *
 * Работает только против localhost/127.0.0.1: отказ с кодом выхода 1 до
 * любого подключения, как `validate()` в scripts/db-refresh.ts. Боевая база
 * этим скриптом недостижима по построению.
 *
 * Фазы строго последовательны: сначала читается ВСЁ и печатается план, и
 * только потом, и только с `--yes`, одной транзакцией пишется. После записи
 * счёта перечитываются и сверяются с предсказанием: расхождение — ошибка, а
 * не строка в выводе.
 *
 * Свой postgres()+drizzle(), как в scripts/migrate-archive.ts: `search_path`
 * берётся только из `--schema`, `DB_SCHEMA` из `.env` игнорируется.
 */
import process from "node:process";
import { inArray, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describeTarget, isLocalHost, sslFor } from "../src/db/ssl";
import * as schema from "../src/db/schema";
import { type ResetCounts, planArchiveReset } from "./archive-reset-rules";

const { news, newsPhoto, document, newsDocument } = schema;

// ───────────────────────── аргументы ─────────────────────────

function parseArgs(argv: string[]) {
  let schemaArg: string | undefined;
  let yes = false;

  for (const arg of argv) {
    if (arg === "--yes") {
      yes = true;
    } else if (arg.startsWith("--schema=")) {
      schemaArg = arg.slice("--schema=".length);
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  if (schemaArg !== "dev" && schemaArg !== "public") {
    throw new Error('--schema обязателен и должен быть "dev" или "public"');
  }

  return { schemaArg, yes };
}

const { schemaArg, yes } = parseArgs(process.argv.slice(2));

function fail(message: string): never {
  console.error(`Отказ: ${message}`);
  process.exit(1);
}

// ───────────────────────── фаза A: валидация ─────────────────────────

/**
 * Вся валидация — до любого действия и до подключения. К моменту первого
 * запроса не должно остаться ни одной непроверенной предпосылки.
 */
function validate(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail("DATABASE_URL не задан — нечего чистить.");
  }
  try {
    new URL(url);
  } catch {
    fail("DATABASE_URL не разбирается как строка подключения.");
  }
  if (!isLocalHost(url)) {
    fail(
      `DATABASE_URL указывает на ${new URL(url).hostname} — reset-archive работает только ` +
        `с локальной базой. Удаление на удалённом сервере невозможно по построению.`,
    );
  }
  return url;
}

console.log(`Хост: ${describeTarget(process.env.DATABASE_URL)}, схема: ${schemaArg}`);

const connectionString = validate();

let sqlInstance: ReturnType<typeof postgres> | undefined;
let dbInstance: PostgresJsDatabase<typeof schema> | undefined;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!dbInstance) {
    sqlInstance = postgres(connectionString, {
      max: 1,
      connection: { search_path: schemaArg },
      ssl: sslFor(connectionString),
    });
    dbInstance = drizzle(sqlInstance, { schema });
  }
  return dbInstance;
}

/** Замер четырёх таблиц одним проходом — им же сверяется результат. */
async function countRows(db: PostgresJsDatabase<typeof schema>): Promise<ResetCounts> {
  const [newsRows, photoRows, docRows, linkRows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(news),
    db.select({ n: sql<number>`count(*)::int` }).from(newsPhoto),
    db.select({ n: sql<number>`count(*)::int` }).from(document),
    db.select({ n: sql<number>`count(*)::int` }).from(newsDocument),
  ]);
  return {
    news: newsRows[0].n,
    photo: photoRows[0].n,
    document: docRows[0].n,
    link: linkRows[0].n,
  };
}

function printCounts(label: string, c: ResetCounts): void {
  console.log(
    `${label}: новостей ${c.news}, фото ${c.photo}, документов ${c.document}, связей ${c.link}`,
  );
}

async function main() {
  const db = getDb();

  // ── фаза B: чтение. Ни одной записи до конца фазы. ──
  const [newsRows, photoRows, docRows, linkRows] = await Promise.all([
    db.select({ id: news.id, source: news.source }).from(news),
    db.select({ newsId: newsPhoto.newsId }).from(newsPhoto),
    db.select({ id: document.id }).from(document),
    db
      .select({ newsId: newsDocument.newsId, documentId: newsDocument.documentId })
      .from(newsDocument),
  ]);

  const plan = planArchiveReset({
    news: newsRows,
    photos: photoRows,
    documentIds: docRows.map((d) => d.id),
    links: linkRows,
  });

  console.log("─── что будет удалено ───");
  console.log(
    `новостей архива: ${plan.newsIds.length} из ${plan.before.news}` +
      ` (фото и связи уйдут каскадом)`,
  );
  console.log(`документов только архивных: ${plan.documentIds.length} из ${plan.before.document}`);
  console.log("───────────────────────────────────────");
  printCounts("было   ", plan.before);
  printCounts("станет ", plan.after);

  if (!yes) {
    console.log("───────────────────────────────────────");
    console.log("Изменений не внесено. Для выполнения повторите запуск с флагом --yes.");
    return;
  }

  // ── фаза C: запись, одной транзакцией ──
  await db.transaction(async (tx) => {
    if (plan.documentIds.length > 0) {
      await tx.delete(document).where(inArray(document.id, plan.documentIds));
    }
    if (plan.newsIds.length > 0) {
      await tx.delete(news).where(inArray(news.id, plan.newsIds));
    }
  });

  const actual = await countRows(db);
  console.log("───────────────────────────────────────");
  console.log(
    `новости:   ${plan.before.news} → ${actual.news}\n` +
      `фото:      ${plan.before.photo} → ${actual.photo}\n` +
      `документы: ${plan.before.document} → ${actual.document}\n` +
      `связи:     ${plan.before.link} → ${actual.link}`,
  );

  const mismatches = (Object.keys(plan.after) as Array<keyof ResetCounts>).filter(
    (k) => plan.after[k] !== actual[k],
  );
  if (mismatches.length > 0) {
    console.error("───────────────────────────────────────");
    for (const k of mismatches) {
      console.error(`Расхождение по «${k}»: предсказано ${plan.after[k]}, замерено ${actual[k]}`);
    }
    fail("замер после удаления разошёлся с предсказанием — смотреть глазами.");
  }
  console.log("Замер сошёлся с предсказанием.");
}

try {
  await main();
} finally {
  await sqlInstance?.end();
}
