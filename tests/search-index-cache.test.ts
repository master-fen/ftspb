import { describe, expect, test } from "bun:test";
import { createIndexCache } from "@/server/search-index";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createIndexCache — истечение TTL без ожидания посетителя", () => {
  test("просроченный индекс отдаётся немедленно, пересборка идёт в фоне одна на всех", async () => {
    let buildCalls = 0;
    const cache = createIndexCache(async () => {
      buildCalls += 1;
      return { value: buildCalls };
    }, 10);

    const first = await cache.load();
    expect(first).toEqual({ value: 1 });
    expect(buildCalls).toBe(1);

    await new Promise((r) => setTimeout(r, 20)); // TTL истёк

    // Два параллельных запроса на просроченный индекс — оба видят старое
    // значение немедленно, а не ждут фоновую сборку.
    const [second, third] = await Promise.all([cache.load(), cache.load()]);
    expect(second).toEqual({ value: 1 });
    expect(third).toEqual({ value: 1 });

    // Пока фоновая сборка не завершилась, вызовов build ровно на один больше
    // (одна фоновая сборка на оба параллельных запроса, не две).
    await new Promise((r) => setTimeout(r, 5));
    expect(buildCalls).toBe(2);
  });

  test("после resetSearchIndex() следующий вызов ждёт новую сборку синхронно", async () => {
    let buildCalls = 0;
    const cache = createIndexCache(async () => {
      buildCalls += 1;
      return { value: buildCalls };
    }, 100_000); // TTL заведомо не истечёт за время теста

    const first = await cache.load();
    expect(first).toEqual({ value: 1 });

    cache.reset();

    const second = await cache.load();
    expect(second).toEqual({ value: 2 });
    expect(buildCalls).toBe(2);
  });

  test("ошибка фоновой сборки не оставляет индекс устаревшим навсегда", async () => {
    let buildCalls = 0;
    const cache = createIndexCache(async () => {
      buildCalls += 1;
      if (buildCalls === 1) return { value: 1 };
      if (buildCalls === 2) throw new Error("сбой фоновой сборки");
      return { value: buildCalls };
    }, 10);

    const first = await cache.load();
    expect(first).toEqual({ value: 1 });

    await new Promise((r) => setTimeout(r, 20)); // TTL истёк

    const stale = await cache.load(); // отдаёт прежний, запускает фоновую (упадёт)
    expect(stale).toEqual({ value: 1 });

    await new Promise((r) => setTimeout(r, 20)); // фоновая сборка успела упасть

    // Следующий вызов не получает старый индекс бесконечно — он видит
    // "empty" и собирает синхронно заново (третий вызов build — успешный).
    const recovered = await cache.load();
    expect(recovered).toEqual({ value: 3 });
  });

  test("ошибка синхронной сборки (из «empty») не глотается и не вешает следующий вызов", async () => {
    let buildCalls = 0;
    const cache = createIndexCache(async () => {
      buildCalls += 1;
      if (buildCalls === 1) throw new Error("БД недоступна");
      return { value: buildCalls };
    }, 100_000);

    await expect(cache.load()).rejects.toThrow("БД недоступна");

    // Следующий вызов не застревает на упавшем промисе — пробует заново.
    const recovered = await cache.load();
    expect(recovered).toEqual({ value: 2 });
  });

  test("сброс во время фоновой сборки — поздний результат старого поколения не побеждает новое состояние", async () => {
    const buildCall2 = deferred<{ value: number }>();
    let call = 0;
    const cache = createIndexCache(() => {
      call += 1;
      if (call === 1) return Promise.resolve({ value: 1 });
      if (call === 2) return buildCall2.promise; // зависает — имитирует медленную фоновую сборку
      return Promise.resolve({ value: 3 });
    }, 10);

    const initial = await cache.load(); // call 1 — синхронная сборка
    expect(initial).toEqual({ value: 1 });

    await new Promise((r) => setTimeout(r, 20)); // TTL истёк

    const stale = await cache.load(); // видит просрочку, отдаёт старое, запускает call 2 в фоне
    expect(stale).toEqual({ value: 1 });

    cache.reset(); // сброс, пока call 2 всё ещё висит — поколение увеличилось

    const afterReset = await cache.load(); // "empty" после сброса → синхронная сборка, call 3
    expect(afterReset).toEqual({ value: 3 });

    buildCall2.resolve({ value: 2 }); // поздний результат старого поколения разрешается только теперь
    await new Promise((r) => setTimeout(r, 5));

    const stillThree = await cache.load(); // не должен откатиться к {value:2}
    expect(stillThree).toEqual({ value: 3 });
  });
});
