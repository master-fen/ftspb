import { describe, expect, test } from "bun:test";
import {
  GENERAL_MEETING_LOCATION_ERROR,
  mergeEventPatch,
  validateCreateEvent,
  validateEvent,
  validateUpdateEvent,
  type EventState,
} from "@/lib/event-input";

const base: EventState = {
  slug: "zasedanie-pravleniya-2026",
  title: "Заседание Правления",
  type: "board",
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

describe("validateEvent: правило Устава для Общего собрания", () => {
  const meeting: EventState = { ...base, type: "general_meeting" };

  test("published + day + без места — ошибка с точным текстом", () => {
    expect(() => validateEvent({ ...meeting, status: "published" })).toThrow(
      GENERAL_MEETING_LOCATION_ERROR,
    );
  });

  test("published + day + место — проходит", () => {
    expect(
      validateEvent({ ...meeting, status: "published", location: "Челиева, 13" }).location,
    ).toBe("Челиева, 13");
  });

  test("черновик без места — проходит", () => {
    expect(validateEvent({ ...meeting, status: "draft" }).status).toBe("draft");
  });

  test("published + quarter без места — проходит (правило только для точной даты)", () => {
    const result = validateEvent({
      ...meeting,
      status: "published",
      datePrecision: "quarter",
      startsOn: "2026-08-17",
    });
    expect(result.location).toBeNull();
    expect(result.startsOn).toBe("2026-07-01");
  });

  test.each(["board", "audit", "other"] as const)(
    "тип %s: published без места — проходит",
    (type) => {
      expect(validateEvent({ ...base, type, status: "published" }).location).toBeNull();
    },
  );
});

describe("validateCreateEvent: значения по умолчанию", () => {
  test("необязательные поля получают умолчания колонок", () => {
    const result = validateCreateEvent({
      slug: "x-2026",
      title: "Событие",
      type: "other",
      startsOn: "2026-03-19",
    });
    expect(result).toEqual({
      slug: "x-2026",
      title: "Событие",
      type: "other",
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

describe("validateUpdateEvent: правило проверяется по слитому состоянию", () => {
  const meetingDraft: EventState = {
    ...base,
    type: "general_meeting",
    status: "draft",
    location: null,
  };

  test("патч только со status — правило срабатывает", () => {
    expect(() => validateUpdateEvent(meetingDraft, { status: "published" })).toThrow(
      GENERAL_MEETING_LOCATION_ERROR,
    );
  });

  test("патч только со status при уже заданном месте — проходит", () => {
    const withLocation: EventState = { ...meetingDraft, location: "Челиева, 13" };
    expect(validateUpdateEvent(withLocation, { status: "published" }).status).toBe("published");
  });

  test("патч, снимающий место у опубликованного собрания, — ошибка", () => {
    const published: EventState = {
      ...meetingDraft,
      status: "published",
      location: "Челиева, 13",
    };
    expect(() => validateUpdateEvent(published, { location: null })).toThrow(
      GENERAL_MEETING_LOCATION_ERROR,
    );
  });

  test("патч только с точностью обнуляет время и переносит якорь", () => {
    const timed: EventState = { ...base, startsOn: "2026-08-17", startsTime: "18:00" };
    const result = validateUpdateEvent(timed, { datePrecision: "half_year" });
    expect(result.startsTime).toBeNull();
    expect(result.startsOn).toBe("2026-07-01");
  });

  test("патч только со status у Общего собрания с точностью quarter — проходит", () => {
    const quarterMeeting: EventState = {
      ...meetingDraft,
      datePrecision: "quarter",
      startsOn: "2026-07-01",
    };
    expect(validateUpdateEvent(quarterMeeting, { status: "published" }).status).toBe("published");
  });
});
