import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

/**
 * Сторож размера входных файлов bun.
 *
 * bun 1.3.14 кэширует результат транспиляции входного файла от 51200 байт
 * (~/.bun/install/cache/@t@) и со второго запуска отдаёт чужую запись: прогон
 * падает разбором соседнего `.jpg` как TypeScript, хотя файл не менялся.
 * Замер и воспроизведение — в `docs/lessons.md`.
 *
 * Порог касается только **входного** файла: импортируемый модуль на 53660
 * байт проверен и работает. Поэтому лечение — держать вход маленьким и
 * выносить логику в соседние модули, а не дописывать переменную окружения в
 * каждую команду.
 */
const BUN_ENTRY_LIMIT = 51200;

const scriptsDir = import.meta.dir;
const root = path.resolve(scriptsDir, "..");

/**
 * Запускается `node`, а не `bun` (нужен `TextDecoder` windows-1251, см.
 * `docs/tools.md`), поэтому кэш транспайлера bun его не касается. Файл в
 * десять раз больше порога и уменьшать его незачем.
 */
const NOT_BUN_ENTRIES = new Set(["parse-archive.ts"]);

/** Импортируемые модули: у них своя запись кэша, порог входа к ним не применим. */
const MODULES = new Set([
  "archive-image-rule.ts",
  "archive-markers.ts",
  "archive-migration-rules.ts",
  "archive-reset-rules.ts",
  "text-to-html.ts",
]);

/** Входные файлы, которые `docs/tools.md` велит запускать `bun`-ом напрямую. */
const DIRECT_BUN_ENTRIES = [
  "backfill-document-fields.ts",
  "check-content-disposition.ts",
  "compress-archive.ts",
  "css-extract.ts",
  "css-rule-forms.ts",
  "dedupe-cover.ts",
  "snapshot-align.ts",
  "snapshot-compare.ts",
  "snapshot-locate.ts",
  "ssr-snapshot.ts",
];

/** Входные файлы из `package.json`: список не пишется руками, а читается. */
function entriesFromPackageJson(): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as {
    scripts: Record<string, string>;
  };
  const found = new Set<string>();
  for (const command of Object.values(pkg.scripts)) {
    for (const match of command.matchAll(/scripts\/([\w.-]+\.ts)/g)) {
      found.add(match[1]);
    }
  }
  return [...found].sort();
}

/** Всё, что лежит в `scripts/`, кроме тестов и файлов под маской `*.local.*`. */
function allScripts(): string[] {
  return fs
    .readdirSync(scriptsDir)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => !name.endsWith(".test.ts"))
    .filter((name) => !name.includes(".local."))
    .sort();
}

const packageEntries = entriesFromPackageJson();
const bunEntries = [...new Set([...packageEntries, ...DIRECT_BUN_ENTRIES])].sort();

describe("входные файлы bun не перерастают 50 КиБ", () => {
  test("package.json действительно называет входные файлы", () => {
    // Отрицательный контроль списка: если бы разбор package.json ничего не
    // нашёл, проверки ниже прошли бы на пустом множестве.
    expect(packageEntries).toContain("migrate-archive.ts");
    expect(packageEntries.length).toBeGreaterThanOrEqual(8);
  });

  for (const name of bunEntries) {
    test(name, () => {
      const size = fs.statSync(path.join(scriptsDir, name)).size;
      if (size >= BUN_ENTRY_LIMIT) {
        throw new Error(
          `scripts/${name} — ${size} байт, предел ${BUN_ENTRY_LIMIT}. ` +
            `Кэш транспайлера bun со второго запуска отдаёт для такого входного файла ` +
            `чужую запись, и прогон падает разбором .jpg как TypeScript. ` +
            `Вынесите логику в соседний модуль — на импортируемые файлы предел не ` +
            `распространяется. Подробности и воспроизведение — docs/lessons.md.`,
        );
      }
    });
  }

  test("ни один файл scripts/ не выпал из разбора", () => {
    // Иначе новый скрипт молча оказался бы вне сторожа.
    const unclassified = allScripts().filter(
      (name) => !bunEntries.includes(name) && !MODULES.has(name) && !NOT_BUN_ENTRIES.has(name),
    );
    expect(unclassified).toEqual([]);
  });

  test("названные модули и не-bun входы действительно лежат в scripts/", () => {
    // Сторож против опечатки в списках: выбывший файл иначе снимал бы
    // проверку с одноимённого входного.
    const present = new Set(allScripts());
    for (const name of [...MODULES, ...NOT_BUN_ENTRIES]) {
      expect({ name, present: present.has(name) }).toEqual({ name, present: true });
    }
  });
});
