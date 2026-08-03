import process from "node:process";
import { defineConfig } from "drizzle-kit";
import { TIMEWEB_CA } from "./src/db/ca";

const rawUrl = process.env.DATABASE_URL;

/**
 * `db:generate` не требует живого подключения, диффует схему с локальными
 * снапшотами. dbCredentials ниже нужны только для `drizzle-kit studio`.
 *
 * `drizzle-kit migrate` НЕ используется (см. package.json `db:migrate` /
 * scripts/migrate.ts): drizzle-kit валидирует dbCredentials собственной
 * zod-схемой и молча вырезает любые поля вне
 * host/port/user/password/database/ssl — через это нельзя передать
 * search_path, а без него drizzle-kit CLI всегда пишет в схему по
 * умолчанию, игнорируя DB_SCHEMA.
 */
function buildDbCredentials() {
  if (!rawUrl) return { url: "" };

  const url = new URL(rawUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: {
      ca: TIMEWEB_CA,
      rejectUnauthorized: true,
    },
  };
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: buildDbCredentials(),
});
