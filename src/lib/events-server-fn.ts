import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DATE_PRECISION_VALUES } from "@/lib/event-date";
import { getPublishedDocumentsForEvent as getPublishedDocumentsForEventImpl } from "@/server/documents";
import {
  checkSlugAvailable as checkSlugAvailableImpl,
  createEvent as createEventImpl,
  getAdminEvent as getAdminEventImpl,
  getPublishedEventBySlug as getPublishedEventBySlugImpl,
  listAdminEvents as listAdminEventsImpl,
  listEventOptions as listEventOptionsImpl,
  listPublishedEventYears as listPublishedEventYearsImpl,
  listPublishedEventsByYear as listPublishedEventsByYearImpl,
  listPublishedNewsForEvent as listPublishedNewsForEventImpl,
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
const precisionSchema = z.enum(DATE_PRECISION_VALUES);

const eventFieldsSchema = z.object({
  slug: z.string(),
  title: z.string(),
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

/*
 * Публичные функции — /federation/events и /federation/events/$slug.
 *
 * requireSession здесь нет НАМЕРЕННО: это чтение для публичных страниц. Всё,
 * что отдаётся, серверный модуль уже ограничил опубликованными живыми
 * записями и явным списком колонок (src/server/events.ts,
 * src/server/documents.ts); ключ S3 наружу не уходит — только готовый URL.
 */

export const listPublishedEventYears = createServerFn({ method: "GET" }).handler(() =>
  listPublishedEventYearsImpl(),
);

export const listPublishedEventsByYear = createServerFn({ method: "GET" })
  .validator(z.number().int().min(1).max(9999))
  .handler(({ data }) => listPublishedEventsByYearImpl(data));

export const getPublishedEventBySlug = createServerFn({ method: "GET" })
  .validator(z.string().min(1).max(200))
  .handler(({ data }) => getPublishedEventBySlugImpl(data));

export const getPublishedDocumentsForEvent = createServerFn({ method: "GET" })
  .validator(z.string().uuid())
  .handler(({ data }) => getPublishedDocumentsForEventImpl(data));

export const listPublishedNewsForEvent = createServerFn({ method: "GET" })
  .validator(z.string().uuid())
  .handler(({ data }) => listPublishedNewsForEventImpl(data));
