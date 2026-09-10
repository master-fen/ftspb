/**
 * Даты событий. Все функции чистые и работают со строками `YYYY-MM-DD`.
 *
 * Объекты `Date` здесь не создаются намеренно. `new Date("2026-03-19")` — это
 * полночь UTC; контейнер прода живёт в UTC, машина разработчика — нет, и
 * форматирование такой даты локальными методами уезжает на день назад или
 * вперёд в зависимости от машины. Со строками этой ошибки быть не может.
 *
 * Дата события хранится якорем (`startsOn`) плюс точностью (`precision`):
 * якорь — всегда первый день периода. См. docs/schema.md, раздел event.
 */

export type DatePrecision = "day" | "month" | "quarter" | "half_year" | "year";

type Parts = { year: number; month: number; day: number };

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Разбор `YYYY-MM-DD`. Бросает на неверном формате: молчаливый NaN хуже. */
function parse(isoDate: string): Parts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match === null) {
    throw new Error(`Ожидалась дата в формате YYYY-MM-DD, получено: ${isoDate}`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

const format = ({ year, month, day }: Parts): string =>
  `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;

/** Последний день месяца; год високосный — по григорианскому правилу. */
function lastDayOfMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Номер квартала (1–4) по месяцу. */
export function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

/** Номер полугодия (1–2) по месяцу. */
export function halfYearOf(month: number): number {
  return month <= 6 ? 1 : 2;
}

/**
 * Якорь периода — первый день периода, в который попадает `startsOn`.
 * При точности `day` возвращает саму дату.
 */
export function normalizeAnchor(startsOn: string, precision: DatePrecision): string {
  const { year, month, day } = parse(startsOn);
  switch (precision) {
    case "day":
      return format({ year, month, day });
    case "month":
      return format({ year, month, day: 1 });
    case "quarter":
      return format({ year, month: (quarterOf(month) - 1) * 3 + 1, day: 1 });
    case "half_year":
      return format({ year, month: halfYearOf(month) === 1 ? 1 : 7, day: 1 });
    case "year":
      return format({ year, month: 1, day: 1 });
  }
}

/**
 * Последний день периода. При точности `day` — та же дата.
 * Считается от исходной даты, а не от якоря: результат одинаков для любой
 * даты внутри периода.
 */
export function periodEnd(startsOn: string, precision: DatePrecision): string {
  const { year, month, day } = parse(startsOn);
  switch (precision) {
    case "day":
      return format({ year, month, day });
    case "month":
      return format({ year, month, day: lastDayOfMonth(year, month) });
    case "quarter": {
      const endMonth = quarterOf(month) * 3;
      return format({ year, month: endMonth, day: lastDayOfMonth(year, endMonth) });
    }
    case "half_year": {
      const endMonth = halfYearOf(month) === 1 ? 6 : 12;
      return format({ year, month: endMonth, day: lastDayOfMonth(year, endMonth) });
    }
    case "year":
      return format({ year, month: 12, day: 31 });
  }
}

/**
 * Событие прошло, если весь его период уже позади. «III квартал 2026» не
 * считается прошедшим 15 августа 2026 — только с 1 октября.
 * `today` передаётся явно: обращаться к часам внутри чистой функции нельзя.
 */
export function isPast(startsOn: string, precision: DatePrecision, today: string): boolean {
  return periodEnd(startsOn, precision) < today;
}

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const MONTHS_NOMINATIVE = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

const ROMAN_QUARTER = ["I", "II", "III", "IV"];

/** `HH:MM:SS` → `HH:MM`; уже короткое значение возвращается как есть. */
function trimSeconds(startsTime: string): string {
  const match = /^(\d{2}:\d{2})/.exec(startsTime);
  return match === null ? startsTime : match[1];
}

/**
 * Полная подпись: «19 марта 2026», «19 марта 2026, 18:00», «март 2027»,
 * «III квартал 2026», «1-е полугодие 2026», «2-е полугодие 2026», «2030».
 * `startsTime` учитывается только при точности `day`.
 */
export function formatEventDateLong(
  startsOn: string,
  precision: DatePrecision,
  startsTime?: string | null,
): string {
  const { year, month, day } = parse(startsOn);
  switch (precision) {
    case "day": {
      const base = `${day} ${MONTHS_GENITIVE[month - 1]} ${year}`;
      return startsTime ? `${base}, ${trimSeconds(startsTime)}` : base;
    }
    case "month":
      return `${MONTHS_NOMINATIVE[month - 1]} ${year}`;
    case "quarter":
      return `${ROMAN_QUARTER[quarterOf(month) - 1]} квартал ${year}`;
    case "half_year":
      return `${halfYearOf(month)}-е полугодие ${year}`;
    case "year":
      return String(year);
  }
}

/**
 * Короткая подпись без года: «19 мар», «март», «III кв.», «1-е пол.».
 * Исключение — точность `year`: там год и есть вся подпись.
 */
export function formatEventDateShort(startsOn: string, precision: DatePrecision): string {
  const { year, month, day } = parse(startsOn);
  switch (precision) {
    case "day":
      return `${day} ${MONTHS_SHORT[month - 1]}`;
    case "month":
      return MONTHS_NOMINATIVE[month - 1];
    case "quarter":
      return `${ROMAN_QUARTER[quarterOf(month) - 1]} кв.`;
    case "half_year":
      return `${halfYearOf(month)}-е пол.`;
    case "year":
      return String(year);
  }
}

/** Год якоря — для slug и для группировки в списке. */
export function eventYear(startsOn: string): number {
  return parse(startsOn).year;
}

/**
 * Дата «опубликовать не позднее» — за `days` дней до даты события.
 * Считается вычитанием дней из календарной даты без объектов `Date`.
 */
export function subtractDays(isoDate: string, days: number): string {
  const parts = parse(isoDate);
  let { year, month, day } = parts;
  let rest = days;
  while (rest > 0) {
    if (day > rest) {
      day -= rest;
      rest = 0;
    } else {
      rest -= day;
      month -= 1;
      if (month === 0) {
        month = 12;
        year -= 1;
      }
      day = lastDayOfMonth(year, month);
    }
  }
  return format({ year, month, day });
}
