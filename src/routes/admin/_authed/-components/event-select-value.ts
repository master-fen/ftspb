/**
 * Кодирование «событие не выбрано» для формы новости.
 *
 * Отдельный модуль без компонентов намеренно: react-refresh требует, чтобы
 * файл с компонентом экспортировал только компоненты, иначе горячая
 * перезагрузка ломается (то же правило разнесло federationNav и
 * FederationSidebar).
 *
 * Пустая строка не годится: Radix Select не принимает пустое значение у
 * SelectItem.
 */
export const NO_EVENT = "none";

export function eventIdToFormValue(eventId: string | null): string {
  return eventId ?? NO_EVENT;
}

export function formValueToEventId(value: string): string | null {
  return value === NO_EVENT ? null : value;
}
