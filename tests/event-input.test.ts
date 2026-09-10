import { describe, expect, test } from "bun:test";
import {
  EVENT_TIME_FORMAT_ERROR,
  mergeEventPatch,
  validateCreateEvent,
  validateEvent,
  validateUpdateEvent,
  type EventState,
} from "@/lib/event-input";

const base: EventState = {
  slug: "zasedanie-pravleniya-2026",
  title: "Заседание Правления",
  startsOn: "2026-03-19",
  startsTime: null,
  datePrecision: "day",
  location: null,
  description: null,
  status: "draft",
};

describe("validateEvent: обязательные поля", () => {
  test("пустое название — ошибка", () => {
    expect(() => validateEvent({ ...base, title: "   " })).toThrow(/Название/);
  });

  test("название обрезается", () => {
    expect(validateEvent({ ...base, title: "  Заседание  " }).title).toBe("Заседание");
  });

  test("пустой slug — ошибка", () => {
    expect(() => validateEvent({ ...base, slug: "" })).toThrow(/Адрес/);
  });

  test.each(["Событие_1", "--x--", "ЗАСЕДАНИЕ", "a--b", "-abc", "abc-"])(
    "slug %s не проходит формат",
    (slug) => {
      expect(() => validateEvent({ ...base, slug })).toThrow(/латинских букв/);
    },
  );

  test.each(["a", "zasedanie-2026", "board-2026-03-19", "x1"])("slug %s проходит", (slug) => {
    expect(validateEvent({ ...base, slug }).slug).toBe(slug);
  });
});

describe("validateEvent: якорь и время", () => {
  test("якорь нормализуется всегда", () => {
    expect(
      validateEvent({ ...base, startsOn: "2026-08-17", datePrecision: "quarter" }).startsOn,
    ).toBe("2026-07-01");
  });

  test("точность day — время сохраняется", () => {
    expect(validateEvent({ ...base, startsTime: "18:00" }).startsTime).toBe("18:00");
  });

  test("пустая строка времени → null", () => {
    expect(validateEvent({ ...base, startsTime: "  " }).startsTime).toBeNull();
  });

  test.each(["month", "quarter", "half_year", "year"] as const)(
    "точность %s — время обнуляется",
    (datePrecision) => {
      expect(validateEvent({ ...base, datePrecision, startsTime: "18:00" }).startsTime).toBeNull();
    },
  );

  test("пустые место и описание → null", () => {
    const result = validateEvent({ ...base, location: "  ", description: "" });
    expect(result.location).toBeNull();
    expect(result.description).toBeNull();
  });
});

describe("validateEvent: формат времени", () => {
  test.each(["18:00", "09:30:15", "00:00", "23:59:59"])("%s проходит", (startsTime) => {
    expect(validateEvent({ ...base, startsTime }).startsTime).toBe(startsTime);
  });

  test.each(["полдень", "25:00", "18:60", "8:00", "1800", "18:00:60", "18-00"])(
    "%s — ошибка с точным текстом",
    (startsTime) => {
      expect(() => validateEvent({ ...base, startsTime })).toThrow(EVENT_TIME_FORMAT_ERROR);
    },
  );

  test("точность month — мусор не проверяется, а обнуляется", () => {
    expect(
      validateEvent({ ...base, datePrecision: "month", startsTime: "полдень" }).startsTime,
    ).toBeNull();
  });
});

describe("validateEvent: место не требуется", () => {
  test("published + day без места — проходит", () => {
    const result = validateEvent({ ...base, status: "published" });
    expect(result.status).toBe("published");
    expect(result.location).toBeNull();
  });
});

describe("validateCreateEvent: значения по умолчанию", () => {
  test("необязательные поля получают умолчания колонок", () => {
    const result = validateCreateEvent({
      slug: "x-2026",
      title: "Событие",
      startsOn: "2026-03-19",
    });
    expect(result).toEqual({
      slug: "x-2026",
      title: "Событие",
      startsOn: "2026-03-19",
      startsTime: null,
      datePrecision: "day",
      location: null,
      description: null,
      status: "draft",
    });
  });
});

describe("mergeEventPatch", () => {
  test("отсутствующие ключи берутся из текущего состояния", () => {
    expect(mergeEventPatch(base, { title: "Новое" })).toEqual({ ...base, title: "Новое" });
  });

  test("явный undefined равнозначен отсутствию ключа", () => {
    expect(mergeEventPatch(base, { location: undefined }).location).toBeNull();
  });

  test("null обнуляет поле", () => {
    expect(mergeEventPatch({ ...base, location: "Зал" }, { location: null }).location).toBeNull();
  });
});

describe("validateUpdateEvent: правила проверяются по слитому состоянию", () => {
  test("патч только с точностью обнуляет время и переносит якорь", () => {
    const timed: EventState = { ...base, startsOn: "2026-08-17", startsTime: "18:00" };
    const result = validateUpdateEvent(timed, { datePrecision: "half_year" });
    expect(result.startsTime).toBeNull();
    expect(result.startsOn).toBe("2026-07-01");
  });

  test("время из базы в формате ЧЧ:ММ:СС проходит при патче без времени", () => {
    const fromDb: EventState = { ...base, startsTime: "18:00:00" };
    expect(validateUpdateEvent(fromDb, { title: "Новое" }).startsTime).toBe("18:00:00");
  });

  test("патч только с мусорным временем — ошибка", () => {
    expect(() => validateUpdateEvent(base, { startsTime: "полдень" })).toThrow(
      EVENT_TIME_FORMAT_ERROR,
    );
  });
});
