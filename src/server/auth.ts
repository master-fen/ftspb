import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { adminSession, adminUser } from "@/db/schema";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Bcrypt-хеш (cost 10) фиктивного пароля. Сравнение с ним при отсутствующем
 * логине держит время ответа verifyLogin таким же, как при неверном пароле
 * существующего пользователя — иначе логин можно перебирать по таймингу.
 */
const DUMMY_HASH = "$2b$10$jLaVFtnm4mKM8eN0cxbm2.9pknhzLzYGA9pEhiSf/JyZrs9IlknAy";

export type AdminUser = typeof adminUser.$inferSelect;

function requireDb(): NonNullable<typeof db> {
  if (db === null) {
    throw new Error(
      "Требуется БД (DATABASE_URL не задан), а для admin-аутентификации мок-фолбэка нет",
    );
  }
  return db;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyLogin(login: string, password: string): Promise<AdminUser | null> {
  const database = requireDb();
  const [user] = await database.select().from(adminUser).where(eq(adminUser.login, login)).limit(1);

  // bcrypt.compare выполняется всегда, даже если user не найден — сравнение
  // идёт с DUMMY_HASH, чтобы не выдавать таймингом существование логина.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !user.isActive || !ok) {
    return null;
  }
  return user;
}

export async function createSession(
  userId: string,
  opts: { userAgent?: string | null; ip?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const database = requireDb();

  const token = randomBytes(32).toString("base64url");
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await database.transaction(async (tx) => {
    await tx.insert(adminSession).values({
      id,
      userId,
      expiresAt,
      userAgent: opts.userAgent ?? null,
      ip: opts.ip ?? null,
    });
    // last_login_at фиксируется здесь же, в одной транзакции с созданием
    // сессии — это и есть момент завершённого входа.
    await tx.update(adminUser).set({ lastLoginAt: new Date() }).where(eq(adminUser.id, userId));
  });

  return { token, expiresAt };
}

export async function validateSession(token: string): Promise<AdminUser | null> {
  const database = requireDb();
  const id = hashToken(token);

  // Отдельного крона нет — протухшие строки чистятся при каждом обращении.
  await database.delete(adminSession).where(lt(adminSession.expiresAt, new Date()));

  const [session] = await database
    .select()
    .from(adminSession)
    .where(and(eq(adminSession.id, id), gt(adminSession.expiresAt, new Date())))
    .limit(1);
  if (!session) {
    return null;
  }

  const [user] = await database
    .select()
    .from(adminUser)
    .where(eq(adminUser.id, session.userId))
    .limit(1);
  if (!user || !user.isActive) {
    return null;
  }
  return user;
}

export async function deleteSession(token: string): Promise<void> {
  const database = requireDb();
  const id = hashToken(token);
  await database.delete(adminSession).where(eq(adminSession.id, id));
}
