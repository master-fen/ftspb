import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { event } from "@/db/schema";
import { eventYear } from "@/lib/event-date";
import {
  validateCreateEvent,
  validateUpdateEvent,
  type EventInput,
  type EventPatch,
  type EventState,
} from "@/lib/event-input";
import { requireSession } from "@/server/auth";
import { slugify } from "@/server/slug";

/**
 * События Федерации (таблица `event`) — админка. Публичных функций здесь нет:
 * публичные страницы событий — отдельный PR.
 *
 * Каждая функция начинается с requireSession: guard в
 * src/routes/admin/_authed/route.tsx навигационный, а не граница безопасности
 * (CLAUDE.md) — эндпоинты createServerFn вызываются по HTTP напрямую.
 *
 * Нормализация якоря и обнуление starts_time живут в src/lib/event-input.ts и
 * применяются и в create, и в update — форме не доверяем.
 */

export type EventRow = typeof event.$inferSelect;

function requireDb(): NonNullable<typeof db> {
  if (db === null) {
    throw new Error("Требуется БД (DATABASE_URL не задан), а для админки мок-фолбэка нет");
  }
  return db;
}

/** Postgres unique_violation — коллизия slug на уровне частичного индекса. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Занятыми считаются только живые записи — согласованно с частичным индексом
 * event_slug_active_idx (`where deleted_at is null`): мягко удалённое событие
 * освобождает адрес. Это отличается от новостей, где индекс сплошной.
 */
async function isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
  const database = requireDb();
  const conditions = [eq(event.slug, slug), isNull(event.deletedAt)];
  if (excludeId) {
    conditions.push(ne(event.id, excludeId));
  }
  const rows = await database
    .select({ id: event.id })
    .from(event)
    .where(and(...conditions))
    .limit(1);
  return rows.length === 0;
}

export type ListAdminEventsParams = {
  status?: EventState["status"];
  includeDeleted?: boolean;
};

/** Список для админки: любой статус, свежие сверху. */
export async function listAdminEvents(params: ListAdminEventsParams = {}): Promise<EventRow[]> {
  await requireSession();
  const database = requireDb();

  const conditions = [];
  if (params.status) {
    conditions.push(eq(event.status, params.status));
  }
  if (!params.includeDeleted) {
    conditions.push(isNull(event.deletedAt));
  }

  const query = database.select().from(event);
  return conditions.length > 0
    ? query.where(and(...conditions)).orderBy(desc(event.startsOn), asc(event.title))
    : query.orderBy(desc(event.startsOn), asc(event.title));
}

/** Краткий вид для селекта «Событие» в редакторе новости. */
export type EventOption = {
  id: string;
  title: string;
  startsOn: string;
  datePrecision: EventState["datePrecision"];
  status: EventState["status"];
};

export async function listEventOptions(): Promise<EventOption[]> {
  await requireSession();
  const database = requireDb();

  // Колонки перечислены явно: селекту не нужны ни описание, ни служебные даты.
  return database
    .select({
      id: event.id,
      title: event.title,
      startsOn: event.startsOn,
      datePrecision: event.datePrecision,
      status: event.status,
    })
    .from(event)
    .where(isNull(event.deletedAt))
    .orderBy(desc(event.startsOn), asc(event.title));
}

export async function getAdminEvent(id: string): Promise<EventRow> {
  await requireSession();
  const database = requireDb();

  const [row] = await database.select().from(event).where(eq(event.id, id)).limit(1);
  if (!row) {
    throw new Error(`Событие не найдено: ${id}`);
  }
  return row;
}

/** Строка базы → состояние для валидатора (те же поля, без служебных дат). */
function toState(row: EventRow): EventState {
  return {
    slug: row.slug,
    title: row.title,
    startsOn: row.startsOn,
    startsTime: row.startsTime,
    datePrecision: row.datePrecision,
    location: row.location,
    description: row.description,
    status: row.status,
  };
}

export async function createEvent(input: EventInput): Promise<{ id: string; slug: string }> {
  await requireSession();
  const database = requireDb();

  const state = validateCreateEvent(input);

  if (!(await isSlugAvailable(state.slug))) {
    throw new Error(`Адрес уже используется: ${state.slug}`);
  }

  try {
    const [row] = await database
      .insert(event)
      .values(state)
      .returning({ id: event.id, slug: event.slug });
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Адрес уже используется: ${state.slug}`);
    }
    throw error;
  }
}

/**
 * Правила проверяются по ПОЛНОМУ состоянию, а не по патчу: сначала читаем
 * текущую строку, сливаем с патчем, валидируем результат. Иначе патч
 * `{ datePrecision: "quarter" }` не перенёс бы якорь и не обнулил время —
 * `startsOn` и `startsTime` в нём нет.
 */
export async function updateEvent(id: string, patch: EventPatch): Promise<void> {
  await requireSession();
  const database = requireDb();

  const current = await getAdminEvent(id);
  const next = validateUpdateEvent(toState(current), patch);

  if (next.slug !== current.slug && !(await isSlugAvailable(next.slug, id))) {
    throw new Error(`Адрес уже используется: ${next.slug}`);
  }

  try {
    await database
      .update(event)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(event.id, id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Адрес уже используется: ${next.slug}`);
    }
    throw error;
  }
}

export async function softDeleteEvent(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  await database.update(event).set({ deletedAt: new Date() }).where(eq(event.id, id));
}

/**
 * Восстановление освобождённого адреса может упереться в частичный индекс,
 * если за это время адрес занял другой живой event. Сообщаем это по-русски,
 * а не голым PostgresError.
 */
export async function restoreEvent(id: string): Promise<void> {
  await requireSession();
  const database = requireDb();
  try {
    await database.update(event).set({ deletedAt: null }).where(eq(event.id, id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(
        "Адрес события уже занят другим событием — измените адрес перед восстановлением",
      );
    }
    throw error;
  }
}

export async function checkSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
  await requireSession();
  return isSlugAvailable(slug, excludeId);
}

/**
 * Подсказка адреса: транслитерация названия плюс год якоря. При коллизии —
 * числовой суффикс, как у новостей (там при коллизии сначала пробуется дата).
 */
export async function suggestSlug(title: string, startsOn: string): Promise<string> {
  await requireSession();

  const base = slugify(title);
  const withYear = base ? `${base}-${eventYear(startsOn)}` : String(eventYear(startsOn));
  if (await isSlugAvailable(withYear)) {
    return withYear;
  }

  let n = 2;
  while (!(await isSlugAvailable(`${withYear}-${n}`))) {
    n += 1;
  }
  return `${withYear}-${n}`;
}
