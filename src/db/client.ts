import process from "node:process";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * `DATABASE_URL` отсутствует в превью Lovable — это штатный режим,
 * а не ошибка конфигурации. В этом случае клиент не создаётся.
 */
const connectionString = process.env.DATABASE_URL;

const queryClient = connectionString
  ? postgres(connectionString, {
      // На проде 2 ГБ RAM — держим пул небольшим.
      max: 5,
    })
  : null;

export const db: PostgresJsDatabase<typeof schema> | null = queryClient
  ? drizzle(queryClient, { schema })
  : null;
