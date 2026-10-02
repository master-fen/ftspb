import type { ReactNode } from "react";

/**
 * Метка статуса в строке списка: «Состоялось» у прошедших событий
 * (EventPastBadge), «Идёт» у турниров календаря. Текст, а не только цвет:
 * цвет сам по себе смысл не передаёт.
 */
export function StatusBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block shrink-0 rounded bg-muted px-1.5 py-0.5 align-middle font-ui text-[11px] leading-4 font-semibold tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}
