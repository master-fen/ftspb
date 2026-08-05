import process from "node:process";
import { isLocked, recordFailure, recordSuccess } from "../src/server/login-throttle";

/**
 * Проверка src/server/login-throttle.ts вне unit-тестов (их в проекте нет).
 * Каждый сценарий — свой логин+IP: attempts внутри login-throttle.ts общая
 * модульная Map, один и тот же ключ на разных сценариях испортил бы счётчики.
 */

let failedChecks = 0;

function check(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) {
    failedChecks += 1;
  }
}

const realNow = Date.now;
let fakeNow = realNow();
Date.now = () => fakeNow;

try {
  // Сценарий 1: блокировка возникает на пятой неудаче, не раньше.
  {
    const login = "check-throttle-1";
    const ip = "10.0.0.1";
    for (let i = 0; i < 4; i++) recordFailure(login, ip);
    check("после 4 неудач не заблокирован", isLocked(login, ip).locked === false);
    recordFailure(login, ip);
    check("после 5-й неудачи заблокирован", isLocked(login, ip).locked === true);
  }

  // Сценарий 2: до истечения 15 минут вход остаётся заблокированным.
  {
    const login = "check-throttle-2";
    const ip = "10.0.0.2";
    for (let i = 0; i < 5; i++) recordFailure(login, ip);
    check("заблокирован сразу после 5 неудач", isLocked(login, ip).locked === true);
    fakeNow += 10 * 60 * 1000;
    check("всё ещё заблокирован через 10 минут (< 15)", isLocked(login, ip).locked === true);
  }

  // Сценарий 3: после истечения блокировки следующая неудача — первая,
  // а не мгновенный новый локаут.
  {
    const login = "check-throttle-3";
    const ip = "10.0.0.3";
    for (let i = 0; i < 5; i++) recordFailure(login, ip);
    fakeNow += 16 * 60 * 1000;
    check("блокировка снята через 16 минут (> 15)", isLocked(login, ip).locked === false);
    recordFailure(login, ip);
    check(
      "одна неудача после сброса не даёт мгновенную блокировку",
      isLocked(login, ip).locked === false,
    );
  }

  // Сценарий 4: recordSuccess очищает счётчик.
  {
    const login = "check-throttle-4";
    const ip = "10.0.0.4";
    for (let i = 0; i < 4; i++) recordFailure(login, ip);
    recordSuccess(login, ip);
    for (let i = 0; i < 4; i++) recordFailure(login, ip);
    check("4 неудачи после успешного входа не блокируют", isLocked(login, ip).locked === false);
  }
} finally {
  Date.now = realNow;
}

if (failedChecks > 0) {
  console.error(`${failedChecks} проверка(и) провалены`);
  process.exitCode = 1;
}
