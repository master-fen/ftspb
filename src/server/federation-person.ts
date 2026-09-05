import { randomBytes } from "node:crypto";
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
import {
  detectImageSignature,
  EXTENSION_BY_TYPE,
  isWithinSizeLimit,
  MAX_UPLOAD_BYTES,
} from "@/lib/image-validation";
import { getCurrentSession } from "@/server/auth";
import { buildImageUrl, deleteObject, objectExists, uploadObject } from "@/server/storage";

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
  /** Готовый URL фото (buildImageUrl на сервере) или null; сам ключ S3 наружу не отдаётся. */
  photoUrl: string | null;
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
  const rows = await db
    .select({
      id: federationPerson.id,
      fullName: federationPerson.fullName,
      role: federationPerson.role,
      bio: federationPerson.bio,
      phone: federationPerson.phone,
      email: federationPerson.email,
      position: federationPerson.position,
      photoS3Key: federationPerson.photoS3Key,
    })
    .from(federationPerson)
    .where(and(eq(federationPerson.status, "published"), isNull(federationPerson.deletedAt)))
    .orderBy(asc(federationPerson.position));
  // Ключ S3 участвует только в вычислении URL и наружу не попадает.
  return rows.map(({ photoS3Key, ...rest }) => ({
    ...rest,
    photoUrl: photoS3Key ? buildImageUrl(photoS3Key) : null,
  }));
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

async function pickUniquePersonKey(personId: string, ext: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `persons/${personId}/u${randomBytes(4).toString("hex")}.${ext}`;
    if (!(await objectExists(candidate))) {
      return candidate;
    }
  }
  throw new Error("Не удалось подобрать уникальный ключ файла");
}

export type UploadPersonPhotoInput = {
  personId: string;
  body: Buffer;
  /** Тип, заявленный клиентом; проверяется по содержимому, а не принимается на веру. */
  contentType: string;
};

/**
 * Замена фото. Порядок строго: (а) залить новый объект; (б) записать новый
 * ключ в колонку; (в) только после успешной записи удалить старый объект.
 * Сбой (б) → удалить НОВЫЙ объект и пробросить исходную ошибку, старый ключ в
 * колонке не трогать. Сбой (в) → не падать: колонка уже верна, висячий объект
 * уберёт отдельная чистка бакета, в лог — console.warn.
 */
export async function uploadPersonPhoto(
  input: UploadPersonPhotoInput,
): Promise<{ key: string; url: string }> {
  await requireSession();
  const database = requireDb();

  if (!isWithinSizeLimit(input.body.length)) {
    throw new Error(`Файл больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ`);
  }
  const detected = detectImageSignature(input.body);
  if (!detected) {
    throw new Error("Файл не похож на изображение поддерживаемого формата (jpeg/png/gif/webp)");
  }
  if (input.contentType && input.contentType !== detected) {
    throw new Error(
      `Содержимое файла (${detected}) не совпадает с заявленным типом (${input.contentType})`,
    );
  }

  const [person] = await database
    .select({ id: federationPerson.id, photoS3Key: federationPerson.photoS3Key })
    .from(federationPerson)
    .where(eq(federationPerson.id, input.personId))
    .limit(1);
  if (!person) {
    throw new Error(`Персона не найдена: ${input.personId}`);
  }

  const key = await pickUniquePersonKey(person.id, EXTENSION_BY_TYPE[detected]);
  await uploadObject(key, input.body, detected); // (а)

  try {
    const updated = await database // (б)
      .update(federationPerson)
      .set({ photoS3Key: key, updatedAt: new Date() })
      .where(eq(federationPerson.id, person.id))
      .returning({ id: federationPerson.id });
    if (updated.length === 0) {
      throw new Error(`Персона не найдена: ${input.personId}`);
    }
  } catch (error) {
    try {
      await deleteObject(key);
    } catch (cleanupError) {
      console.warn(
        `[federation-person] не удалось откатить объект S3 после сбоя записи ключа: ${key}`,
        cleanupError,
      );
    }
    throw error; // исходная ошибка, не подменяется ошибкой отката
  }

  if (person.photoS3Key && person.photoS3Key !== key) {
    try {
      await deleteObject(person.photoS3Key); // (в)
    } catch (error) {
      console.warn(
        `[federation-person] не удалось удалить старое фото ${person.photoS3Key}, колонка уже указывает на ${key}`,
        error,
      );
    }
  }

  return { key, url: buildImageUrl(key) };
}

/** Обнулить колонку, затем удалить объект; сбой удаления объекта — только console.warn. */
export async function deletePersonPhoto(personId: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  const [person] = await database
    .select({ id: federationPerson.id, photoS3Key: federationPerson.photoS3Key })
    .from(federationPerson)
    .where(eq(federationPerson.id, personId))
    .limit(1);
  if (!person) {
    throw new Error(`Персона не найдена: ${personId}`);
  }
  if (!person.photoS3Key) {
    return;
  }
  await database
    .update(federationPerson)
    .set({ photoS3Key: null, updatedAt: new Date() })
    .where(eq(federationPerson.id, person.id));
  try {
    await deleteObject(person.photoS3Key);
  } catch (error) {
    console.warn(`[federation-person] не удалось удалить объект S3: ${person.photoS3Key}`, error);
  }
}

/** Фото в S3 при мягком удалении НЕ удаляется — строка остаётся, ключ вместе с ней. */
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
