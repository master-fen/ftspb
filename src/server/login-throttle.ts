const FAILURE_LIMIT = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const ENTRY_TTL_MS = LOCKOUT_MS * 2;

type Entry = {
  failures: number;
  lockedUntil: number | null;
  lastAttemptAt: number;
};

const attempts = new Map<string, Entry>();

function key(login: string, ip: string): string {
  return `${login}:${ip}`;
}

/** Отдельного таймера нет — устаревшие записи выметаются при каждом обращении. */
function sweep(now: number): void {
  for (const [k, entry] of attempts) {
    if (now - entry.lastAttemptAt > ENTRY_TTL_MS) {
      attempts.delete(k);
    }
  }
}

export function isLocked(login: string, ip: string): { locked: boolean; retryAfterMs?: number } {
  const now = Date.now();
  sweep(now);

  const entry = attempts.get(key(login, ip));
  if (!entry || entry.lockedUntil === null || entry.lockedUntil <= now) {
    if (entry && entry.lockedUntil !== null && entry.lockedUntil <= now) {
      // Блокировка истекла — считаем это чистым состоянием, иначе одна
      // следующая ошибка (при failures, оставшихся на FAILURE_LIMIT) сразу
      // даёт новые 15 минут без права на попытку.
      entry.failures = 0;
      entry.lockedUntil = null;
    }
    return { locked: false };
  }
  return { locked: true, retryAfterMs: entry.lockedUntil - now };
}

export function recordFailure(login: string, ip: string): void {
  const now = Date.now();
  sweep(now);

  const k = key(login, ip);
  const entry = attempts.get(k) ?? { failures: 0, lockedUntil: null, lastAttemptAt: now };
  entry.failures += 1;
  entry.lastAttemptAt = now;
  if (entry.failures >= FAILURE_LIMIT) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
  attempts.set(k, entry);
}

export function recordSuccess(login: string, ip: string): void {
  attempts.delete(key(login, ip));
}
