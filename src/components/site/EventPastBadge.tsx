/**
 * Метка «Состоялось» — у прошедших событий (isPast из src/lib/event-date.ts
 * по todayInMoscow) в списке /federation/events и на странице события.
 * Текст, а не только приглушённый цвет: цвет сам по себе смысл не передаёт.
 */
export function EventPastBadge() {
  return (
    <span className="inline-block shrink-0 rounded bg-muted px-1.5 py-0.5 align-middle font-ui text-[11px] leading-4 font-semibold tracking-wide text-muted-foreground">
      Состоялось
    </span>
  );
}
