/**
 * Генератор src/lib/charter/content.ts из docs/charter/ustav.lines.json.
 *
 * Обычный запуск (`bun run charter:build`) перезаписывает content.ts;
 * с флагом `--check` (`bun run charter:check`) файл генерируется в память и
 * сравнивается с лежащим на диске побайтно — расхождение означает, что
 * content.ts правили руками или разъехались правила разбора, код выхода 1.
 *
 * Результат прогоняется через API prettier с конфигом репозитория, чтобы
 * сгенерированный файл проходил `prettier --check` без ручных прикосновений.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import prettier from "prettier";

import { parseCharterLines, type CharterLinesJson } from "../src/lib/charter/parse-lines";

const root = path.resolve(import.meta.dir, "..");
const sourcePath = path.join(root, "docs", "charter", "ustav.lines.json");
const targetPath = path.join(root, "src", "lib", "charter", "content.ts");

const json = JSON.parse(readFileSync(sourcePath, "utf8")) as CharterLinesJson;
const content = parseCharterLines(json);

const raw = [
  "// сгенерировано scripts/build-charter-content.ts из docs/charter/ustav.lines.json, не редактировать руками",
  'import type { CharterContent } from "./types";',
  "",
  `export const charterContent: CharterContent = ${JSON.stringify(content)};`,
  "",
].join("\n");

const prettierConfig = await prettier.resolveConfig(targetPath);
const formatted = await prettier.format(raw, { ...prettierConfig, filepath: targetPath });

if (process.argv.includes("--check")) {
  const existing = readFileSync(targetPath, "utf8");
  if (existing !== formatted) {
    console.error(
      "src/lib/charter/content.ts не совпадает с результатом генерации — перегенерируйте: bun run charter:build",
    );
    process.exit(1);
  }
  console.log("src/lib/charter/content.ts актуален");
} else {
  writeFileSync(targetPath, formatted);
  console.log(`записан ${path.relative(root, targetPath)}`);
}
