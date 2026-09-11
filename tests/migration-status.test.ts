import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import journal from "../drizzle/meta/_journal.json";
import {
  compareMigrations,
  createTtlCache,
  TimeoutError,
  withTimeout,
  type JournalEntry,
} from "@/lib/migration-status";

const JOURNAL: JournalEntry[] = [
  { tag: "0000_a", when: 1000 },
  { tag: "0001_b", when: 2000 },
  { tag: "0002_c", when: 3000 },
];

// bigint из postgres.js приходит строкой — фикстуры в том же виде.
const row = (when: number) => ({ created_at: String(when), hash: `h${when}`.padEnd(64, "0") });

describe("compareMigrations", () => {
  test("совпадение → ok", () => {
    expect(compareMigrations(JOURNAL, [row(1000), row(2000), row(3000)])).toEqual({ state: "ok" });
  });

  test("миграция из репозитория не применена", () => {
    expect(compareMigrations(JOURNAL, [row(1000), row(2000)])).toEqual({
      state: "mismatch",
      notApplied: [{ tag: "0002_c", when: 3000 }],
      unknownInDb: [],
    });
  });

  test("в базе есть миграция, которой нет в репозитории (откат)", () => {
    expect(compareMigrations(JOURNAL.slice(0, 2), [row(1000), row(2000), row(3000)])).toEqual({
      state: "mismatch",
      notApplied: [],
      unknownInDb: [{ createdAt: 3000, hash12: "h30000000000" }],
    });
  });

  test("расхождение в обе стороны сразу", () => {
    const result = compareMigrations(JOURNAL, [row(1000), row(2000), row(9000)]);
    expect(result).toEqual({
      state: "mismatch",
      notApplied: [{ tag: "0002_c", when: 3000 }],
      unknownInDb: [{ createdAt: 9000, hash12: "h90000000000" }],
    });
  });

  test("пустая база → все миграции репозитория не применены", () => {
    const result = compareMigrations(JOURNAL, []);
    expect(result.state).toBe("mismatch");
    expect(result.state === "mismatch" && result.notApplied.map((e) => e.tag)).toEqual([
      "0000_a",
      "0001_b",
      "0002_c",
    ]);
  });

  test("журнал репозитория: when уникальны — на них держится сверка", () => {
    const whens = journal.entries.map((entry) => entry.when);
    expect(new Set(whens).size).toBe(whens.length);
  });
});

describe("createTtlCache", () => {
  test("до 60 000 мс — то же значение без нового вызова, на 60 000 — новый вызов", async () => {
    let clock = 0;
    let calls = 0;
    const cache = createTtlCache<number>(60_000, () => clock);
    const load = async () => ++calls;

    expect(await cache.get(load)).toBe(1);
    clock = 59_999;
    expect(await cache.get(load)).toBe(1);
    expect(calls).toBe(1);
    clock = 60_000;
    expect(await cache.get(load)).toBe(2);
    expect(calls).toBe(2);
  });

  test("параллельные вызовы делят один промис", async () => {
    let calls = 0;
    const cache = createTtlCache<number>(60_000, () => 0);
    const load = async () => ++calls;

    const first = cache.get(load);
    const second = cache.get(load);
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(calls).toBe(1);
  });

  test("отклонение не кешируется: две попытки с падающей загрузкой — два вызова", async () => {
    let calls = 0;
    const cache = createTtlCache<number>(60_000, () => 0);
    const failing = async (): Promise<number> => {
      calls += 1;
      throw new Error("база недоступна");
    };

    await expect(cache.get(failing)).rejects.toThrow("база недоступна");
    await expect(cache.get(failing)).rejects.toThrow("база недоступна");
    expect(calls).toBe(2);

    // После сбоя успешный результат кешируется как обычно.
    const ok = async () => 42;
    expect(await cache.get(ok)).toBe(42);
    expect(await cache.get(failing)).toBe(42);
    expect(calls).toBe(2);
  });

  test("синхронный throw в загрузке — тоже отклонение, не исключение из get", async () => {
    const cache = createTtlCache<number>(60_000, () => 0);
    const throwsSync = (): Promise<number> => {
      throw new Error("sync");
    };
    await expect(cache.get(throwsSync)).rejects.toThrow("sync");
  });
});

describe("withTimeout", () => {
  let unhandled = 0;
  const onUnhandled = () => {
    unhandled += 1;
  };
  beforeAll(() => {
    process.on("unhandledRejection", onUnhandled);
  });
  afterAll(() => {
    process.off("unhandledRejection", onUnhandled);
  });

  test("успел — значение запроса", async () => {
    const late: unknown[] = [];
    expect(await withTimeout(Promise.resolve(7), 1_000, (e) => late.push(e))).toBe(7);
    expect(late).toEqual([]);
  });

  test("отклонился до таймаута — его ошибка, onLateError не зовётся", async () => {
    const late: unknown[] = [];
    const failing = Promise.reject(new Error("отказ"));
    await expect(withTimeout(failing, 1_000, (e) => late.push(e))).rejects.toThrow("отказ");
    expect(late).toEqual([]);
  });

  test("отклонение после таймаута уходит в onLateError, unhandled rejection нет", async () => {
    const late: unknown[] = [];
    const slow = new Promise<number>((_, reject) => {
      setTimeout(() => reject(new Error("поздний отказ")), 30);
    });

    await expect(withTimeout(slow, 5, (e) => late.push(e))).rejects.toBeInstanceOf(TimeoutError);
    // Дождаться позднего отклонения проигравшей стороны.
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(late).toHaveLength(1);
    expect((late[0] as Error).message).toBe("поздний отказ");
    expect(unhandled).toBe(0);
  });
});
