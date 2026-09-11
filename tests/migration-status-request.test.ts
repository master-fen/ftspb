import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import type { MigrationStatus } from "@/lib/migration-status";
import { requestMigrationStatus } from "@/lib/migration-status-request";

const REQUEST_FAILED: MigrationStatus = { state: "unavailable", reason: "request-failed" };

const silenceConsoleError = () => spyOn(console, "error").mockImplementation(() => {});

describe("requestMigrationStatus", () => {
  let consoleError: ReturnType<typeof silenceConsoleError>;
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
  beforeEach(() => {
    consoleError = silenceConsoleError();
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  test("источник отклонился (сеть, 5xx, 401) → unavailable / request-failed", async () => {
    const rejected = () =>
      Promise.reject(new Error("401 Требуется активная сессия администратора"));
    expect(await requestMigrationStatus(rejected)).toEqual(REQUEST_FAILED);

    const throwsSync = (): Promise<MigrationStatus> => {
      throw new Error("sync");
    };
    expect(await requestMigrationStatus(throwsSync)).toEqual(REQUEST_FAILED);
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  test("источник не ответил в срок → unavailable / request-failed", async () => {
    // Таймаут параметром: реального ожидания 8 с нет.
    const never = () => new Promise<MigrationStatus>(() => {});
    expect(await requestMigrationStatus(never, 5)).toEqual(REQUEST_FAILED);
  });

  test("отклонение после таймаута уходит в console.error, unhandled rejection нет", async () => {
    const late = () =>
      new Promise<MigrationStatus>((_, reject) => {
        setTimeout(() => reject(new Error("поздний отказ")), 30);
      });
    expect(await requestMigrationStatus(late, 5)).toEqual(REQUEST_FAILED);
    // Дождаться позднего отклонения проигравшей стороны.
    await new Promise((resolve) => setTimeout(resolve, 60));

    const lateLogged = consoleError.mock.calls.some(
      ([, error]) => error instanceof Error && error.message === "поздний отказ",
    );
    expect(lateLogged).toBe(true);
    expect(unhandled).toBe(0);
  });

  test("источник вернул значение → то же значение без изменений", async () => {
    const ok: MigrationStatus = { state: "ok" };
    const mismatch: MigrationStatus = {
      state: "mismatch",
      notApplied: [{ tag: "0001_b", when: 2000 }],
      unknownInDb: [{ createdAt: 9000, hash12: "h90000000000" }],
    };
    expect(await requestMigrationStatus(() => Promise.resolve(ok))).toBe(ok);
    expect(await requestMigrationStatus(() => Promise.resolve(mismatch))).toBe(mismatch);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
