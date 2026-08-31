import process from "node:process";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { describeTarget, sslFor } from "../src/db/ssl";

/**
 * drizzle-kit ("drizzle-kit migrate") валидирует dbCredentials через
 * собственную zod-схему и молча вырезает любые поля вне
 * host/port/user/password/database/ssl — в частности `connection`, через
 * который выставляется search_path. Поэтому применяем миграции напрямую
 * через drizzle-orm, а не через drizzle-kit CLI: так же, как в
 * src/db/client.ts, здесь мы сами задаём и search_path, и CA.
 */
const connectionString = process.env.DATABASE_URL;
const schemaName = process.env.DB_SCHEMA || "public";

if (!connectionString) {
  throw new Error("DATABASE_URL не задан");
}

console.log(`Хост: ${describeTarget(connectionString)}, схема: ${schemaName}`);

const sql = postgres(connectionString, {
  max: 1,
  connection: { search_path: schemaName },
  ssl: sslFor(connectionString),
});

if (schemaName !== "public") {
  await sql`create schema if not exists ${sql(schemaName)}`;
}

// Учёт применённых миграций — в отдельной схеме на каждый DB_SCHEMA, иначе
// прогон в public после dev будет пропущен: drizzle сверяет хэши миграций
// независимо от search_path.
await migrate(drizzle(sql), {
  migrationsFolder: "./drizzle",
  migrationsSchema: `drizzle_${schemaName}`,
});

await sql.end();

console.log(`Миграции применены к схеме "${schemaName}".`);
