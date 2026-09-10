import { DOCUMENT_SLUG_PATTERN } from "@/lib/document-slug";
import { normalizeAnchor, type DatePrecision } from "@/lib/event-date";
import type { EventType } from "@/lib/event-type";

/**
 * Серверная валидация и нормализация события (таблица `event`).
 *
 * Чистый модуль без БД и сессии: его вызывает src/server/events.ts перед
 * insert/update, а tests/event-input.test.ts проверяет правила отдельно от
 * RPC. Zod-схемы в src/lib/events-server-fn.ts задают только форму payload;
 * смысловые правила — здесь, в одном месте.
 *
 * Ключевое: валидируется **полное** состояние записи, а не патч. При
 * обновлении сервер сначала читает текущую строку, сливает с патчем и
 * прогоняет `validateEvent` по результату — иначе правило «Общее собрание при
 * публикации требует места» не сработало бы на патче, где есть только
 * `status`.
 */

export type EventStatus = "draft" | "published";

/** Полное состояние события — то, что уходит в базу. */
export type EventState = {
  slug: string;
  title: string;
  type: EventType;
  startsOn: string;
  startsTime: string | null;
  datePrecision: DatePrecision;
  location: string | null;
  description: string | null;
  status: EventStatus;
};

export type EventInput = {
  slug: string;
  title: string;
  type: EventType;
  startsOn: string;
  startsTime?: string | null;
  datePrecision?: DatePrecision;
  location?: string | null;
  description?: string | null;
  status?: EventStatus;
};

export type EventPatch = Partial<EventInput>;

/** Текст правила Устава — проверяется тестом дословно. */
export const GENERAL_MEETING_LOCATION_ERROR =
  "Для Общего собрания при публикации нужно указать место (Устав, п. 6.1)";

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Поле «${label}» обязательно`);
  }
  return value.trim();
}

/** Необязательный текст: undefined/null/пустая строка → null, иначе trim. */
function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`Поле «${label}» должно быть строкой`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Нормализация и проверка полного состояния события.
 *
 * Якорь приводится к первому дню периода всегда — и в create, и в update:
 * форма может прислать любую дату внутри периода, а в базе должен лежать
 * якорь. `startsTime` при точности не `day` обнуляется здесь же; тот же
 * инвариант закреплён check-констрейнтом в базе.
 */
export function validateEvent(state: EventState): EventState {
  const slug = requiredText(state.slug, "Адрес (slug)");
  if (!DOCUMENT_SLUG_PATTERN.test(slug)) {
    throw new Error(
      "Адрес (slug) может состоять только из латинских букв, цифр и дефисов между ними",
    );
  }

  const title = requiredText(state.title, "Название");
  const datePrecision = state.datePrecision;
  const startsOn = normalizeAnchor(requiredText(state.startsOn, "Дата"), datePrecision);
  const startsTime = datePrecision === "day" ? optionalText(state.startsTime, "Время") : null;
  const location = optionalText(state.location, "Место");
  const description = optionalText(state.description, "Описание");

  if (
    state.status === "published" &&
    state.type === "general_meeting" &&
    datePrecision === "day" &&
    location === null
  ) {
    throw new Error(GENERAL_MEETING_LOCATION_ERROR);
  }

  return {
    slug,
    title,
    type: state.type,
    startsOn,
    startsTime,
    datePrecision,
    location,
    description,
    status: state.status,
  };
}

/** Значения по умолчанию у необязательных полей — как у колонок в базе. */
export function validateCreateEvent(input: EventInput): EventState {
  return validateEvent({
    slug: input.slug,
    title: input.title,
    type: input.type,
    startsOn: input.startsOn,
    startsTime: input.startsTime ?? null,
    datePrecision: input.datePrecision ?? "day",
    location: input.location ?? null,
    description: input.description ?? null,
    status: input.status ?? "draft",
  });
}

/**
 * Слияние патча с текущим состоянием и проверка результата.
 *
 * Ключи, которых в патче нет, берутся из `current`. Явный `undefined` в патче
 * трактуется так же, как отсутствие ключа: обнулить поле можно только `null`
 * или пустой строкой.
 */
export function mergeEventPatch(current: EventState, patch: EventPatch): EventState {
  const pick = <K extends keyof EventState>(key: K): EventState[K] =>
    (patch as Partial<EventState>)[key] === undefined
      ? current[key]
      : ((patch as Partial<EventState>)[key] as EventState[K]);

  return {
    slug: pick("slug"),
    title: pick("title"),
    type: pick("type"),
    startsOn: pick("startsOn"),
    startsTime: pick("startsTime"),
    datePrecision: pick("datePrecision"),
    location: pick("location"),
    description: pick("description"),
    status: pick("status"),
  };
}

export function validateUpdateEvent(current: EventState, patch: EventPatch): EventState {
  return validateEvent(mergeEventPatch(current, patch));
}
