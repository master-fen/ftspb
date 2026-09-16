/*
 * Защитный тест: контейнер публичной зоны — `mx-auto max-w-7xl lg:box-content`
 * плюс отступы (docs/style-rules.md, «Контейнеры»).
 *
 * Макет нарисован на артборде 1920 с полями 320: содержимое 1280. При
 * `border-box` `lg:px-10` съедает 80 px из `max-w-7xl` (80rem) — содержимое
 * 1200. `lg:box-content` отдаёт `max-width` содержимому, отступы ложатся
 * снаружи. Именно `lg:`, а не `box-content`: ниже `lg` `max-width` не
 * срабатывает, а `box-sizing` меняет и высоты — у шапки `max-lg:h-18` с
 * вертикальными отступами строка выросла бы на 20 px.
 *
 * Правило: за каждым вхождением `max-w-7xl` сразу идёт ` lg:box-content`.
 * Область — публичная зона, как у tests/style-fractions.test.ts, только .tsx;
 * файлы — через git ls-files. Номер строки в сообщении — для поиска места, в
 * заморозку он не входит. `есть_вхождения` — защита от холостого прохода, если
 * контейнеры сменят класс.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");

const AREA = ["src/components/site", "src/components/federation", "src/routes/_site*"];

const CONTAINER = "max-w-7xl";
const REQUIRED = " lg:box-content";

function areaFiles(): string[] {
  const out = Bun.spawnSync(["git", "ls-files", "-z", "--", ...AREA], { cwd: root });
  if (out.exitCode !== 0) throw new Error(`git ls-files: ${out.stderr.toString()}`);
  return out.stdout
    .toString()
    .split("\0")
    .filter((file) => file.endsWith(".tsx"));
}

function scan(): { total: number; violations: string[] } {
  let total = 0;
  const violations: string[] = [];
  for (const file of areaFiles()) {
    const lines = readFileSync(path.join(root, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      for (let at = line.indexOf(CONTAINER); at !== -1; at = line.indexOf(CONTAINER, at + 1)) {
        total++;
        if (!line.startsWith(REQUIRED, at + CONTAINER.length)) violations.push(`${file}:${i + 1}`);
      }
    });
  }
  return { total, violations };
}

describe("контейнер публичной зоны", () => {
  test("за каждым max-w-7xl идёт lg:box-content", () => {
    const { total, violations } = scan();
    expect({ есть_вхождения: total > 0, нарушения: violations }).toEqual({
      есть_вхождения: true,
      нарушения: [],
    });
  });
});
