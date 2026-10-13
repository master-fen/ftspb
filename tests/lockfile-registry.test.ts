/*
 * Защитный тест: все пакеты `bun.lock` скачиваются с публичного npm.
 *
 * В записи пакета второе поле — адрес архива. Для реестра по умолчанию
 * (registry.npmjs.org) bun пишет пустую строку; непустой адрес означает
 * другой реестр. До 13.10.2026 у 32 пакетов там стояло частное зеркало
 * Lovable (`…npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`): облачная
 * сессия Claude Code к нему не допущена, и `bun install --frozen-lockfile`
 * падал с 403 — без зависимостей ни lint, ни сборки, ни тестов.
 *
 * Разбор построчный: запись пакета — одна строка вида
 * `"имя": ["имя@версия", "адрес", {…}, "sha512-…"],`. `всего_пакетов` —
 * защита от холостого прохода, если формат файла сменится.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");

const ENTRY = /^\s+"[^"]+": \["[^"]+", "([^"]*)"/;

function scan(): { total: number; foreign: string[] } {
  const lines = readFileSync(path.join(root, "bun.lock"), "utf8").split("\n");
  let total = 0;
  const foreign: string[] = [];
  lines.forEach((line, i) => {
    const m = ENTRY.exec(line);
    if (!m) return;
    total++;
    if (m[1] !== "") foreign.push(`bun.lock:${i + 1} ${m[1]}`);
  });
  return { total, foreign };
}

describe("bun.lock", () => {
  test("у каждого пакета адрес архива пустой — реестр по умолчанию", () => {
    const { total, foreign } = scan();
    expect({ всего_пакетов_больше_сотни: total > 100, чужие_адреса: foreign }).toEqual({
      всего_пакетов_больше_сотни: true,
      чужие_адреса: [],
    });
  });
});
