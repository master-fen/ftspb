import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * drizzle-kit жёстко подставляет `"public".` в CREATE TYPE и в REFERENCES
 * внешних ключей даже для таблиц, объявленных без pgSchema — это его
 * собственное поведение, конфигом не отключается. Схема выбирается через
 * search_path подключения (см. src/db/schema.ts, docs/schema.md), поэтому
 * в SQL миграций схемы быть не должно: иначе REFERENCES "public"."x" будет
 * всегда указывать на public, даже когда миграция применяется к dev.
 */
const migrationsDir = path.resolve(process.cwd(), "drizzle");
const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const original = readFileSync(filePath, "utf8");
  const stripped = original.replaceAll('"public".', "");

  if (stripped !== original) {
    writeFileSync(filePath, stripped);
    console.log(`stripped "public". schema refs from ${file}`);
  }
}
