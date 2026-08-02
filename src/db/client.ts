import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * `DATABASE_URL` отсутствует в превью Lovable — это штатный режим,
 * а не ошибка конфигурации. В этом случае клиент не создаётся.
 */
const connectionString = process.env.DATABASE_URL;
const schemaName = process.env.DB_SCHEMA || "public";

/**
 * CA лежит в репозитории (`certs/timeweb-ca.crt`, публичный сертификат) —
 * не полагаемся на NODE_EXTRA_CA_CERTS, в проде его не будет.
 * `sslmode=verify-full` в DATABASE_URL всё ещё нужен: без него postgres.js
 * не включит проверку сертификата вовсе.
 */
const queryClient = connectionString
  ? postgres(connectionString, {
      // На проде 2 ГБ RAM — держим пул небольшим.
      max: 5,
      // Схема выбирается через search_path, а не в SQL таблиц/миграций —
      // см. src/db/schema.ts.
      connection: { search_path: schemaName },
      ssl: {
        ca: fs.readFileSync(path.resolve(process.cwd(), "certs/timeweb-ca.crt"), "utf8"),
        rejectUnauthorized: true,
      },
    })
  : null;

if (queryClient && schemaName !== "public") {
  // Схема может не существовать при первом деплое — создаём её лениво.
  // Не блокирует экспорт `db`: до завершения этого запроса параллельные
  // обращения к таблицам в новой схеме могут упасть, но на данном этапе
  // приложение ещё не читает/пишет в БД (см. docs/schema.md).
  queryClient`create schema if not exists ${queryClient(schemaName)}`.catch((error: unknown) => {
    console.error(`Не удалось создать схему "${schemaName}":`, error);
  });
}

export const db: PostgresJsDatabase<typeof schema> | null = queryClient
  ? drizzle(queryClient, { schema })
  : null;
