/**
 * Построение части индекса поиска для событий — опубликованные и
 * неудалённые, то же правило, что у публичного списка (`src/server/events.ts`).
 * Поля: название, место, повестка — все короткие/умеренные, позиции
 * хранятся у всех (объём событий на порядок меньше новостей).
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import type { db as Db } from "@/db/client";
import { event } from "@/db/schema";
import { buildFieldWithPositions, type FieldWithPositions } from "@/lib/search-field-index";
import { visibleText } from "@/lib/search-text";

export type EventIndexItem = {
  id: string; // slug
  href: string;
  startsOn: string;
  datePrecision: "day" | "month" | "quarter" | "half_year" | "year";
  createdAt: string;
  title: FieldWithPositions;
  location: FieldWithPositions;
  description: FieldWithPositions;
};

export async function buildEventsIndex(
  database: NonNullable<typeof Db>,
  intern: (value: string) => string,
): Promise<EventIndexItem[]> {
  const rows = await database
    .select({
      slug: event.slug,
      title: event.title,
      location: event.location,
      description: event.description,
      startsOn: event.startsOn,
      datePrecision: event.datePrecision,
      createdAt: event.createdAt,
    })
    .from(event)
    .where(and(eq(event.status, "published"), isNull(event.deletedAt)))
    .orderBy(desc(event.startsOn), desc(event.createdAt), desc(event.id));

  return rows.map((row) => ({
    id: row.slug,
    href: `/federation/events/${row.slug}`,
    startsOn: row.startsOn,
    datePrecision: row.datePrecision,
    createdAt: row.createdAt.toISOString(),
    title: buildFieldWithPositions(visibleText(row.title), intern),
    location: buildFieldWithPositions(visibleText(row.location ?? ""), intern),
    // Повестка — обычный текст без HTML (схема БД), visibleText тут no-op по тегам.
    description: buildFieldWithPositions(visibleText(row.description ?? ""), intern),
  }));
}
