import { sql } from "drizzle-orm";
import journal from "../../drizzle/meta/_journal.json";
import { db, schemaName } from "@/db/client";
import {
  compareMigrations,
  createTtlCache,
  TimeoutError,
  withTimeout,
  type AppliedMigrationRow,
  type JournalEntry,
  type MigrationStatus,
} from "@/lib/migration-status";
import { requireSession } from "@/server/auth";

/**
 * Проверка журнала миграций для баннера на дашборде админки.
 *
 * Код уходит на прод по пушу в main, миграции применяются вручную — возможно
 * «код новее базы» и обратное (откат). Журнал репозитория встраивается в
 * серверный бандл при сборке (импорт JSON), журнал базы читается из
 * `drizzle_<DB_SCHEMA>.__drizzle_migrations` — туда пишет scripts/migrate.ts.
 *
 * Наружу не бросает ничего, кроме 401 из requireSession: нет БД, нет таблицы,
 * нет прав, таймаут — это состояние `unavailable`, страница рендерится.
 */

const JOURNAL: JournalEntry[] = journal.entries.map(({ tag, when }) => ({ tag, when }));

const QUERY_TIMEOUT_MS = 5_000;

/**
 * Кешируется только успешное чтение журнала базы: применённая миграция гасит
 * баннер не позже чем через минуту, без перезапуска. Сбой не кешируется
 * (createTtlCache сбрасывает отклонённый промис) — следующий заход пробует снова.
 */
const CACHE_TTL_MS = 60_000;
const appliedRowsCache = createTtlCache<AppliedMigrationRow[]>(CACHE_TTL_MS);

let journalReads = 0;

/** Сколько раз журнал базы читался на самом деле — для проверочного скрипта. */
export function migrationJournalReads(): number {
  return journalReads;
}

async function readAppliedRows(database: NonNullable<typeof db>): Promise<AppliedMigrationRow[]> {
  journalReads += 1;
  // async-обёртка превращает QueryPromise drizzle в обычный Promise: withTimeout
  // подписывается на него дважды (race и catch), а каждый then у QueryPromise
  // запускает запрос заново.
  const query = (async () =>
    database.execute<AppliedMigrationRow>(
      sql`select created_at, hash from ${sql.identifier(`drizzle_${schemaName}`)}.${sql.identifier("__drizzle_migrations")} order by created_at`,
    ))();
  const rows = await withTimeout(query, QUERY_TIMEOUT_MS, (error) => {
    console.error("Журнал миграций: запрос отклонён уже после таймаута", error);
  });
  return Array.from(rows);
}

/** Без проверки сессии — для getMigrationStatus и проверочных скриптов. */
export async function checkMigrationStatus(): Promise<MigrationStatus> {
  if (db === null) {
    return { state: "unavailable", reason: "no-db" };
  }
  const database = db;
  try {
    const rows = await appliedRowsCache.get(() => readAppliedRows(database));
    return compareMigrations(JOURNAL, rows);
  } catch (error) {
    console.error("Журнал миграций: проверить не удалось", error);
    return {
      state: "unavailable",
      reason: error instanceof TimeoutError ? "timeout" : "query-failed",
    };
  }
}

/**
 * Сессия проверяется до обращения к кешу: guard в admin/_authed/route.tsx
 * навигационный, а эндпоинт createServerFn доступен по HTTP напрямую.
 */
export async function getMigrationStatus(): Promise<MigrationStatus> {
  await requireSession();
  return checkMigrationStatus();
}
