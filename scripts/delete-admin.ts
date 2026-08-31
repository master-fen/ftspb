import process from "node:process";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describeTarget, sslFor } from "../src/db/ssl";
import * as schema from "../src/db/schema";

const { adminUser, adminSession } = schema;

/**
 * См. scripts/create-admin.ts — тот же приём: свой postgres()+drizzle(),
 * search_path только из --schema, DB_SCHEMA из .env игнорируется.
 */

function parseArgs(argv: string[]) {
  let schemaArg: string | undefined;
  let login: string | undefined;
  let yes = false;

  for (const arg of argv) {
    if (arg === "--yes") {
      yes = true;
    } else if (arg.startsWith("--schema=")) {
      schemaArg = arg.slice("--schema=".length);
    } else if (arg.startsWith("--login=")) {
      login = arg.slice("--login=".length);
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  if (schemaArg !== "dev" && schemaArg !== "public") {
    throw new Error('--schema обязателен и должен быть "dev" или "public"');
  }
  if (!login) {
    throw new Error("--login обязателен");
  }

  return { schemaArg, login, yes };
}

const { schemaArg, login, yes } = parseArgs(process.argv.slice(2));

let sqlInstance: ReturnType<typeof postgres> | undefined;
let dbInstance: PostgresJsDatabase<typeof schema> | undefined;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL не задан");
    }
    sqlInstance = postgres(connectionString, {
      max: 1,
      connection: { search_path: schemaArg },
      ssl: sslFor(connectionString),
    });
    dbInstance = drizzle(sqlInstance, { schema });
  }
  return dbInstance;
}

async function main() {
  console.log(
    `Хост: ${describeTarget(process.env.DATABASE_URL)}, схема: ${schemaArg}, логин: ${login}`,
  );

  const db = getDb();

  const [existing] = await db.select().from(adminUser).where(eq(adminUser.login, login)).limit(1);
  if (!existing) {
    console.error(`Логин "${login}" не найден.`);
    process.exitCode = 1;
    return;
  }

  const allAdmins = await db.select({ id: adminUser.id }).from(adminUser);
  const isLastAdmin = allAdmins.length === 1;

  if (!yes) {
    const sessions = await db
      .select({ id: adminSession.id })
      .from(adminSession)
      .where(eq(adminSession.userId, existing.id));

    console.log(
      `Найден: login=${existing.login} id=${existing.id} created_at=${existing.createdAt.toISOString()}`,
    );
    console.log(`Зависимые строки — admin_session: ${sessions.length}`);
    if (isLastAdmin) {
      console.log("Внимание: последний администратор — удаление будет отклонено.");
    }
    console.log("Изменений не внесено. Для удаления повторите запуск с флагом --yes.");
    return;
  }

  if (isLastAdmin) {
    console.error(
      `Отказ: в схеме "${schemaArg}" остался ровно один администратор ("${existing.login}"). Удаление отклонено.`,
    );
    process.exitCode = 1;
    return;
  }

  let deletedSessions = 0;
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(adminSession)
      .where(eq(adminSession.userId, existing.id))
      .returning({ id: adminSession.id });
    deletedSessions = deleted.length;
    await tx.delete(adminUser).where(eq(adminUser.id, existing.id));
  });

  console.log(
    `Удалено: admin_user "${existing.login}" (id ${existing.id}); зависимых сессий убито: ${deletedSessions}.`,
  );
}

try {
  await main();
} finally {
  await sqlInstance?.end();
}
