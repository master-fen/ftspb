import { describe, expect, test } from "bun:test";
import { isLocked, recordFailure, recordSuccess } from "@/server/login-throttle";

/**
 * Портирует сценарии из бывшего scripts/check-throttle.ts на bun:test —
 * логика проверок (пороги, тайминги) не менялась.
 */
describe("login-throttle", () => {
  test("блокировка возникает на пятой неудаче, не раньше", () => {
    const login = "throttle-test-1";
    const ip = "10.0.1.1";
    for (let i = 0; i < 4; i++) recordFailure(login, ip);
    expect(isLocked(login, ip).locked).toBe(false);
    recordFailure(login, ip);
    expect(isLocked(login, ip).locked).toBe(true);
  });

  test("до истечения 15 минут вход остаётся заблокированным", () => {
    const login = "throttle-test-2";
    const ip = "10.0.1.2";
    const realNow = Date.now;
    let fakeNow = realNow();
    Date.now = () => fakeNow;
    try {
      for (let i = 0; i < 5; i++) recordFailure(login, ip);
      expect(isLocked(login, ip).locked).toBe(true);
      fakeNow += 10 * 60 * 1000;
      expect(isLocked(login, ip).locked).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  test("после истечения блокировки следующая неудача — первая, а не мгновенный новый локаут", () => {
    const login = "throttle-test-3";
    const ip = "10.0.1.3";
    const realNow = Date.now;
    let fakeNow = realNow();
    Date.now = () => fakeNow;
    try {
      for (let i = 0; i < 5; i++) recordFailure(login, ip);
      fakeNow += 16 * 60 * 1000;
      expect(isLocked(login, ip).locked).toBe(false);
      recordFailure(login, ip);
      expect(isLocked(login, ip).locked).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  test("recordSuccess очищает счётчик", () => {
    const login = "throttle-test-4";
    const ip = "10.0.1.4";
    for (let i = 0; i < 4; i++) recordFailure(login, ip);
    recordSuccess(login, ip);
    for (let i = 0; i < 4; i++) recordFailure(login, ip);
    expect(isLocked(login, ip).locked).toBe(false);
  });
});
