/**
 * Типы событий Федерации. Один массив — источник и значений enum для zod,
 * и подписей для интерфейса: разъехаться им негде.
 */
export const EVENT_TYPES = [
  { value: "general_meeting", label: "Общее собрание" },
  { value: "board", label: "Правление" },
  { value: "audit", label: "Контроль" },
  { value: "other", label: "Прочее" },
] as const satisfies readonly { value: string; label: string }[];

export type EventType = (typeof EVENT_TYPES)[number]["value"];

/** Значения для `z.enum` — кортеж, как того требует zod. */
export const EVENT_TYPE_VALUES = EVENT_TYPES.map((t) => t.value) as unknown as [
  EventType,
  ...EventType[],
];

const LABEL_BY_VALUE = new Map<EventType, string>(EVENT_TYPES.map((t) => [t.value, t.label]));

export function eventTypeLabel(type: EventType): string {
  return LABEL_BY_VALUE.get(type) ?? type;
}
