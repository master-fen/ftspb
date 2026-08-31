import { randomBytes } from "node:crypto";
import process from "node:process";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describeTarget, sslFor } from "../src/db/ssl";
import * as schema from "../src/db/schema";

const { adminUser, adminSession } = schema;

const BCRYPT_COST = 10;

/**
 * `src/db/client.ts` берёт схему из `DB_SCHEMA` в момент импорта — раньше,
 * чем разберётся `--schema`. Поэтому здесь свой postgres()+drizzle(), как в
 * scripts/migrate-archive.ts: search_path — только из аргумента командной
 * строки, `DB_SCHEMA` из .env игнорируется.
 *
 * По той же причине self-check ниже не импортирует src/server/auth.ts —
 * любой импорт из этого файла транзитивно тянет src/db/client.ts. Вместо
 * этого self-check читает только что записанную строку через этот же
 * db-инстанс и сверяет bcrypt напрямую.
 */

function parseArgs(argv: string[]) {
  let schemaArg: string | undefined;
  let login: string | undefined;
  let name: string | undefined;
  let password: string | undefined;
  let resetPassword = false;

  for (const arg of argv) {
    if (arg === "--reset-password") {
      resetPassword = true;
    } else if (arg.startsWith("--schema=")) {
      schemaArg = arg.slice("--schema=".length);
    } else if (arg.startsWith("--login=")) {
      login = arg.slice("--login=".length);
    } else if (arg.startsWith("--name=")) {
      name = arg.slice("--name=".length);
    } else if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
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
  if (!resetPassword && !name) {
    throw new Error("--name обязателен при создании учётки (не передан --reset-password)");
  }

  return { schemaArg, login, name, password, resetPassword };
}

const {
  schemaArg,
  login,
  name,
  password: passwordArg,
  resetPassword,
} = parseArgs(process.argv.slice(2));

function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

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
  const generated = passwordArg === undefined;
  const password = passwordArg ?? generatePassword();

  const [existing] = await db.select().from(adminUser).where(eq(adminUser.login, login)).limit(1);

  if (resetPassword) {
    if (!existing) {
      console.error(`Логин "${login}" не найден — сбрасывать пароль нечему.`);
      process.exitCode = 1;
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    let deletedSessions = 0;

    // Смена пароля обычно означает компрометацию — старые сессии должны
    // умереть вместе с ней, в одной транзакции.
    await db.transaction(async (tx) => {
      await tx.update(adminUser).set({ passwordHash }).where(eq(adminUser.id, existing.id));
      const deleted = await tx
        .delete(adminSession)
        .where(eq(adminSession.userId, existing.id))
        .returning({ id: adminSession.id });
      deletedSessions = deleted.length;
    });

    console.log(`Пароль сброшен для "${login}". Убито сессий: ${deletedSessions}.`);
  } else {
    if (existing) {
      console.error(`Логин "${login}" уже занят. Для смены пароля используйте --reset-password.`);
      process.exitCode = 1;
      return;
    }
    if (!name) {
      throw new Error("--name обязателен при создании учётки");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await db.insert(adminUser).values({
      login,
      passwordHash,
      displayName: name,
      isActive: true,
    });
    console.log(`Учётка "${login}" создана.`);
  }

  if (generated) {
    console.log(`Сгенерированный пароль (больше нигде не будет напечатан): ${password}`);
  }

  // Самопроверка читает строку заново по login (не по id из insert/update
  // выше) — так она ловит и расхождение схем, и проблемы с
  // кодировкой/пробелами в логине, а не сверяет bcrypt сам с собой.
  const [row] = await db.select().from(adminUser).where(eq(adminUser.login, login)).limit(1);

  console.log(`password_hash: ${row?.passwordHash.slice(0, 7) ?? "-"}...`);

  const correctOk =
    row !== undefined && row.isActive && (await bcrypt.compare(password, row.passwordHash));
  console.log(`self-check (correct password): ${correctOk ? "OK" : "FAILED"}`);

  // Отрицательная проверка: заведомо неверный пароль обязан провалиться —
  // иначе positive-проверка выше могла бы пройти и при compare(), всегда
  // возвращающем true.
  const wrongPassword = `${password}-wrong`;
  const wrongRejected =
    row !== undefined && !(await bcrypt.compare(wrongPassword, row.passwordHash));
  console.log(`self-check (wrong password rejected): ${wrongRejected ? "OK" : "FAILED"}`);

  if (!correctOk || !wrongRejected) {
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await sqlInstance?.end();
}
