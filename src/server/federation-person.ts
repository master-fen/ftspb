import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { federationPerson } from "@/db/schema";
import {
  normalizeCreatePersonInput,
  normalizeUpdatePersonInput,
  type CreatePersonInput,
  type PersonStatus,
  type UpdatePersonInput,
} from "@/lib/federation-person-input";
import { getCurrentSession } from "@/server/auth";

export type PersonRow = typeof federationPerson.$inferSelect;

/** Публичная проекция строки — см. комментарий у listPublishedPersons. */
export type PublicPerson = {
  id: string;
  fullName: string;
  role: string;
  bio: string | null;
  phone: string | null;
  email: string | null;
  position: number;
};

function requireDb(): NonNullable<typeof db> {
  if (db === null) {
    throw new Error("Требуется БД (DATABASE_URL не задан), а для админки мок-фолбэка нет");
  }
  return db;
}

/** Guard в src/routes/admin/_authed/route.tsx — навигационный, не граница
 * безопасности (см. CLAUDE.md). Каждая админская функция этого файла
 * проверяет активную сессию сама, первой строкой. */
async function requireSession() {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Требуется активная сессия администратора");
  }
  return session;
}

export type ListPersonsParams = {
  status?: PersonStatus;
};

/** Админка: все, кроме удалённых; фильтр по статусу; порядок position, затем ФИО. */
export async function listPersons(params: ListPersonsParams = {}): Promise<PersonRow[]> {
  await requireSession();
  const database = requireDb();

  const conditions = [isNull(federationPerson.deletedAt)];
  if (params.status) {
    conditions.push(eq(federationPerson.status, params.status));
  }

  return database
    .select()
    .from(federationPerson)
    .where(and(...conditions))
    .orderBy(asc(federationPerson.position), asc(federationPerson.fullName));
}

/**
 * Публичная страница /federation/leadership. Сессия не требуется — вызвать
 * может кто угодно, поэтому колонки перечислены явно, а не `.select()` всей
 * строкой, как в src/server/documents.ts (там все функции за сессией). При
 * `.select()` без списка любая новая колонка — photo_s3_key, status,
 * deleted_at, created_at/updated_at — автоматически утекала бы в SSR-ответ и
 * loaderData. Наружу — только то, что рисует страница.
 *
 * `db === null` — превью Lovable без DATABASE_URL (штатный режим, не авария):
 * мок-фикстур для людей нет, отдаём пустой список. Ошибку живой БД не глотаем.
 */
export async function listPublishedPersons(): Promise<PublicPerson[]> {
  if (db === null) {
    return [];
  }
  return db
    .select({
      id: federationPerson.id,
      fullName: federationPerson.fullName,
      role: federationPerson.role,
      bio: federationPerson.bio,
      phone: federationPerson.phone,
      email: federationPerson.email,
      position: federationPerson.position,
    })
    .from(federationPerson)
    .where(and(eq(federationPerson.status, "published"), isNull(federationPerson.deletedAt)))
    .orderBy(asc(federationPerson.position));
}

/** Как getAdminDocument: deletedAt не фильтруется — удалённого можно открыть по прямой ссылке. */
export async function getPersonById(id: string): Promise<PersonRow> {
  await requireSession();
  const database = requireDb();
  const [row] = await database
    .select()
    .from(federationPerson)
    .where(eq(federationPerson.id, id))
    .limit(1);
  if (!row) {
    throw new Error(`Персона не найдена: ${id}`);
  }
  return row;
}

export async function createPerson(input: CreatePersonInput): Promise<PersonRow> {
  await requireSession();
  const database = requireDb();
  const values = normalizeCreatePersonInput(input);
  const [row] = await database.insert(federationPerson).values(values).returning();
  return row;
}

export async function updatePerson(id: string, input: UpdatePersonInput): Promise<void> {
  await requireSession();
  const database = requireDb();
  const normalized = normalizeUpdatePersonInput(input);

  // Поля перечислены явно, не через `{ ...input }` — input может прийти как
  // JSON с клиента, где типы не защищают от лишнего ключа, случайно
  // совпавшего с именем колонки (тот же приём, что updateDocument).
  const values: Partial<typeof federationPerson.$inferInsert> = { updatedAt: new Date() };
  if (normalized.fullName !== undefined) values.fullName = normalized.fullName;
  if (normalized.role !== undefined) values.role = normalized.role;
  if (normalized.bio !== undefined) values.bio = normalized.bio;
  if (normalized.phone !== undefined) values.phone = normalized.phone;
  if (normalized.email !== undefined) values.email = normalized.email;
  if (normalized.position !== undefined) values.position = normalized.position;
  if (normalized.status !== undefined) values.status = normalized.status;

  const updated = await database
    .update(federationPerson)
    .set(values)
    .where(eq(federationPerson.id, id))
    .returning({ id: federationPerson.id });
  if (updated.length === 0) {
    throw new Error(`Персона не найдена: ${id}`);
  }
}

export async function softDeletePerson(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  const deleted = await database
    .update(federationPerson)
    .set({ deletedAt: new Date() })
    .where(and(eq(federationPerson.id, id), isNull(federationPerson.deletedAt)))
    .returning({ id: federationPerson.id });
  if (deleted.length === 0) {
    throw new Error(`Персона не найдена или уже удалена: ${id}`);
  }
}
