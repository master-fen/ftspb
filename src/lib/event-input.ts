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
 * прогоняет `validateEvent` по результату — нормализация якоря и обнуление
 * времени зависят от пары `startsOn` + `datePrecision`, а патч может нести
 * только одно из них.
 *
 * Правил Устава здесь нет намеренно: система не запрещает законные ситуации
 * (экстренное собрание, место уточняется позже), за соблюдение Устава
 * отвечает секретарь.
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

/** Текст ошибки формата времени — проверяется тестом дословно. */
export const EVENT_TIME_FORMAT_ERROR =
  "Время указывается в формате ЧЧ:ММ или ЧЧ:ММ:СС, например 18:00";

/**
 * `HH:MM` из формы (`<input type="time">`) или `HH:MM:SS`, как колонку `time`
 * отдаёт база при чтении текущей строки в update. Без этой проверки прямой
 * вызов RPC со строкой «полдень» дошёл бы до Postgres голой ошибкой 22007.
 */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

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
  // При точности не `day` время обнуляется, не глядя на значение: проверять
  // формат того, что всё равно не сохранится, незачем.
  const startsTime = datePrecision === "day" ? optionalText(state.startsTime, "Время") : null;
  if (startsTime !== null && !TIME_PATTERN.test(startsTime)) {
    throw new Error(EVENT_TIME_FORMAT_ERROR);
  }
  const location = optionalText(state.location, "Место");
  const description = optionalText(state.description, "Описание");

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
