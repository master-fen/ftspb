import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createPerson as createPersonImpl,
  deletePersonPhoto as deletePersonPhotoImpl,
  getPersonById as getPersonByIdImpl,
  listPersons as listPersonsImpl,
  listPublishedPersons as listPublishedPersonsImpl,
  softDeletePerson as softDeletePersonImpl,
  updatePerson as updatePersonImpl,
} from "@/server/federation-person";
import { buildImageUrl } from "@/server/storage";

/**
 * `src/server/**` запрещён к прямому импорту из клиентского бандла
 * (import-protection плагин TanStack Start). `createServerFn` — санкционированный
 * обход: тело `.handler()` компилируется только в серверный чанк.
 *
 * Zod здесь задаёт только форму payload; смысловые правила (trim, email,
 * position ≥ 0, "" → null) — в src/lib/federation-person-input.ts, которую
 * вызывает серверный модуль. Дублировать их тут не нужно.
 */

const statusSchema = z.enum(["draft", "published"]);

const personFieldsSchema = z.object({
  fullName: z.string(),
  role: z.string(),
  bio: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  position: z.number(),
  status: statusSchema.optional(),
});

export const listPersons = createServerFn({ method: "GET" })
  .validator(z.object({ status: statusSchema.optional() }))
  .handler(({ data }) => listPersonsImpl(data));

export const listPublishedPersons = createServerFn({ method: "GET" }).handler(() =>
  listPublishedPersonsImpl(),
);

/** Как getAdminDocument: URL фото считается здесь, в админку уходит готовым. */
export const getPersonById = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const row = await getPersonByIdImpl(data);
    return { ...row, photoUrl: row.photoS3Key ? buildImageUrl(row.photoS3Key) : null };
  });

/**
 * Загрузка фото — не здесь: файл идёт multipart через
 * src/routes/api/admin/upload.ts (kind=person-photo), как фото новости.
 */
export const deletePersonPhoto = createServerFn({ method: "POST" })
  .validator((personId: string) => personId)
  .handler(({ data }) => deletePersonPhotoImpl(data));

export const createPerson = createServerFn({ method: "POST" })
  .validator(personFieldsSchema)
  .handler(({ data }) => createPersonImpl(data));

export const updatePerson = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1), input: personFieldsSchema.partial() }))
  .handler(({ data }) => updatePersonImpl(data.id, data.input));

export const softDeletePerson = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }) => softDeletePersonImpl(data));
