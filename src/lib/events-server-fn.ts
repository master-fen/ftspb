import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DATE_PRECISION_VALUES } from "@/lib/event-date";
import { EVENT_TYPE_VALUES } from "@/lib/event-type";
import {
  checkSlugAvailable as checkSlugAvailableImpl,
  createEvent as createEventImpl,
  getAdminEvent as getAdminEventImpl,
  listAdminEvents as listAdminEventsImpl,
  listEventOptions as listEventOptionsImpl,
  restoreEvent as restoreEventImpl,
  softDeleteEvent as softDeleteEventImpl,
  suggestSlug as suggestSlugImpl,
  updateEvent as updateEventImpl,
} from "@/server/events";

/**
 * `src/server/**` запрещён к прямому импорту из клиентского бандла
 * (import-protection плагин TanStack Start). `createServerFn` — санкционированный
 * обход: тело `.handler()` компилируется только в серверный чанк.
 *
 * Zod здесь задаёт только форму payload; смысловые правила (нормализация
 * якоря, обнуление времени, формат времени) — в
 * src/lib/event-input.ts, которую вызывает серверный модуль. Дублировать их
 * тут не нужно.
 */

const statusSchema = z.enum(["draft", "published"]);
const typeSchema = z.enum(EVENT_TYPE_VALUES);
const precisionSchema = z.enum(DATE_PRECISION_VALUES);

const eventFieldsSchema = z.object({
  slug: z.string(),
  title: z.string(),
  type: typeSchema,
  startsOn: z.string(),
  startsTime: z.string().nullable().optional(),
  datePrecision: precisionSchema.optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: statusSchema.optional(),
});

export const listAdminEvents = createServerFn({ method: "GET" })
  .validator(z.object({ status: statusSchema.optional(), includeDeleted: z.boolean().optional() }))
  .handler(({ data }) => listAdminEventsImpl(data));

export const listEventOptions = createServerFn({ method: "GET" }).handler(() =>
  listEventOptionsImpl(),
);

export const getAdminEvent = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(({ data }) => getAdminEventImpl(data));

export const createEvent = createServerFn({ method: "POST" })
  .validator(eventFieldsSchema)
  .handler(({ data }) => createEventImpl(data));

export const updateEvent = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), input: eventFieldsSchema.partial() }))
  .handler(({ data }) => updateEventImpl(data.id, data.input));

export const softDeleteEvent = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }) => softDeleteEventImpl(data));

export const restoreEvent = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }) => restoreEventImpl(data));

export const checkSlugAvailable = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1), excludeId: z.string().optional() }))
  .handler(({ data }) => checkSlugAvailableImpl(data.slug, data.excludeId));

export const suggestSlug = createServerFn({ method: "GET" })
  .validator(z.object({ title: z.string(), startsOn: z.string() }))
  .handler(({ data }) => suggestSlugImpl(data.title, data.startsOn));
