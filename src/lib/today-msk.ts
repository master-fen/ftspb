/**
 * «Сегодня» по московскому календарю — `YYYY-MM-DD` для `isPast` и выбора
 * года в src/lib/event-date.ts.
 *
 * `now.toISOString().slice(0, 10)` здесь не годится: контейнер прода живёт в
 * UTC, и с 00:00 до 03:00 МСК такая строка — ещё вчерашняя дата. Событие
 * 19 марта утром 20-го не считалось бы состоявшимся.
 *
 * Считаем через Intl с `timeZone: "Europe/Moscow"`, а не сдвигом на +3 часа:
 * смещение берётся из базы часовых поясов, а не вшито в код. Дата собирается
 * из `formatToParts`, а не из готовой строки `en-CA` — порядок полей в строке
 * задаёт шаблон локали в ICU, а части от шаблона не зависят. Если в сборке
 * нет данных о часовых поясах, конструктор бросит RangeError — громко, а не
 * молча неверной датой.
 *
 * `now` передаётся явно: функция чистая, часы читает вызывающий код.
 */
const MOSCOW_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayInMoscow(now: Date): string {
  const parts = MOSCOW_DATE.formatToParts(now);
  const part = (type: "year" | "month" | "day") => {
    const value = parts.find((p) => p.type === type)?.value;
    if (value === undefined) {
      throw new Error(`Intl не вернул поле ${type} для даты ${now.toISOString()}`);
    }
    return value;
  };
  return `${part("year")}-${part("month")}-${part("day")}`;
}
