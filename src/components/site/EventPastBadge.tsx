import { StatusBadge } from "@/components/site/StatusBadge";

/**
 * Метка «Состоялось» — у прошедших событий (isPast из src/lib/event-date.ts
 * по todayInMoscow) в списке /federation/events и на странице события.
 * Вид — общий для меток статуса, StatusBadge.
 */
export function EventPastBadge() {
  return <StatusBadge>Состоялось</StatusBadge>;
}
