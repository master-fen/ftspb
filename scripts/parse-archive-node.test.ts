import path from "node:path";
import { describe, expect, test } from "bun:test";

/**
 * Сторож запускаемости разбора архива под `node`.
 *
 * `scripts/parse-archive.ts` — единственный скрипт, который запускает не bun, а
 * node (нужен `TextDecoder("windows-1251")`), и поэтому он исключён из сторожа
 * размера входных файлов (`bun-entry-size.test.ts`, `NOT_BUN_ENTRIES`). Из
 * этого же следует, что ни одна проверка CI его не запускает: пять job-ов — это
 * lint, prettier, typecheck, build и `bun test`.
 *
 * Цена этой слепоты уже заплачена. Коммит f986fb4 («ключи искусственного
 * обрыва заливки», PR #107) добавил в `scripts/archive-migration-rules.ts`
 * импорт `../src/db/ssl.ts`, а тот импортировал `./ca` без расширения — node с
 * разбором типов такой указатель не разрешает. Разбор архива перестал
 * запускаться целиком, включая `--self-test`, а CI остался зелёным: bun и vite
 * разрешают обе формы. Нашлось это только следующей задачей над архивом.
 *
 * Поэтому здесь не проверяется ни одно правило разбора — их проверяет сам
 * `--self-test`, 82 кейса на буквальном входе и выходе. Проверяется ровно то,
 * чего не видит CI: что node доходит до кода и что самотест зелёный.
 */
describe("разбор архива запускается под node", () => {
  const root = path.resolve(import.meta.dir, "..");

  const run = (...args: string[]) => {
    const p = Bun.spawnSync(["node", "scripts/parse-archive.ts", ...args], { cwd: root });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };

  test("самотест проходит целиком, код выхода 0", () => {
    const r = run("--self-test");
    // Сообщение о неразрешённом модуле приходит в stderr до любого вывода —
    // без этой проверки «нет строки про самотест» выглядело бы как обычное
    // падение кейса, а не как непрочитанный импорт.
    expect(r.err).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(r.out).toMatch(/Самотест: (\d+)\/\1 прошло/);
    expect(r.code).toBe(0);
  });

  test("без обязательных аргументов — понятная ошибка, а не падение импорта", () => {
    const r = run();
    expect(r.err).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(r.err).toContain("Обязательны --archive=");
    expect(r.code).toBe(1);
  });
});
