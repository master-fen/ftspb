/**
 * Сверка журнала миграций репозитория (drizzle/meta/_journal.json) с журналом
 * базы (`drizzle_<DB_SCHEMA>.__drizzle_migrations`) — чистые функции без БД.
 *
 * Имени миграции в базе нет: drizzle пишет туда только `hash` (sha256 текста
 * SQL) и `created_at` — это `when` записи журнала. По `created_at` drizzle сам
 * решает, применена ли миграция, поэтому сверка идёт по `when` ↔ `created_at`,
 * а имя (`tag`) берётся из журнала репозитория.
 *
 * Журнал сюда намеренно не импортируется: модуль из src/lib может попасть в
 * клиентский бандл, журнал читает только src/server/migration-status.ts.
 */

export type JournalEntry = { tag: string; when: number };

/** Строка `__drizzle_migrations`; bigint `created_at` postgres.js отдаёт строкой. */
export type AppliedMigrationRow = { created_at: string | number | null; hash: string };

export type MigrationStatus =
  | { state: "ok" }
  | {
      state: "mismatch";
      /** Есть в репозитории, не применена к базе: код новее базы. */
      notApplied: JournalEntry[];
      /** Есть в базе, нет в репозитории: откат кода на более старую версию. */
      unknownInDb: { createdAt: number; hash12: string }[];
    }
  | { state: "unavailable"; reason: "no-db" | "timeout" | "query-failed" };

export function compareMigrations(
  journal: readonly JournalEntry[],
  rows: readonly AppliedMigrationRow[],
): MigrationStatus {
  const applied = new Set(rows.map((row) => Number(row.created_at)));
  const known = new Set(journal.map((entry) => entry.when));

  const notApplied = journal
    .filter((entry) => !applied.has(entry.when))
    .map(({ tag, when }) => ({ tag, when }));
  const unknownInDb = rows
    .filter((row) => !known.has(Number(row.created_at)))
    .map((row) => ({ createdAt: Number(row.created_at), hash12: row.hash.slice(0, 12) }));

  if (notApplied.length === 0 && unknownInDb.length === 0) {
    return { state: "ok" };
  }
  return { state: "mismatch", notApplied, unknownInDb };
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Истёк таймаут ${ms} мс`);
    this.name = "TimeoutError";
  }
}

/**
 * `promise` или `TimeoutError` через `ms`, смотря что раньше. Проигравшая
 * сторона не оставляется без обработчика: запрос, отклонившийся уже после
 * таймаута, уходит в `onLateError`, а не в unhandled rejection. Таймер
 * очищается в любом исходе.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onLateError: (error: unknown) => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new TimeoutError(ms));
    }, ms);
  });
  promise.catch((error: unknown) => {
    if (timedOut) {
      onLateError(error);
    }
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Кеш одного значения на `ttlMs`. Хранится промис: параллельные вызовы до
 * завершения загрузки делят одно обращение. Отклонённый промис не хранится —
 * запись сбрасывается, и следующий вызов пробует заново: сбой не должен
 * «залипать» на весь срок. Часы — параметром, чтобы тест обходился без таймеров.
 */
export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now) {
  let entry: { promise: Promise<T>; storedAt: number } | null = null;

  return {
    get(load: () => Promise<T>): Promise<T> {
      const time = now();
      if (entry !== null && time - entry.storedAt < ttlMs) {
        return entry.promise;
      }
      // async-обёртка: синхронный throw внутри load тоже становится отклонением.
      const promise = (async () => load())();
      const current = { promise, storedAt: time };
      entry = current;
      promise.catch(() => {
        if (entry === current) {
          entry = null;
        }
      });
      return promise;
    },
  };
}
