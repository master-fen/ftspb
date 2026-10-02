/**
 * Фильтры календаря турниров (/tournaments): значения `?place=` и `?age=`,
 * подписи чипов и правила совпадения.
 *
 * Отдельно от src/lib/tournament-calendar.ts и без импорта значений из
 * src/data/tournaments.ts (только типы): схему адреса страницы читает часть
 * маршрута, которая не уходит в ленивый чанк, и импорт данных отсюда положил бы
 * все записи календаря в общий чанк каждой страницы сайта.
 */
import type { Tournament, TournamentAge } from "@/data/tournaments";

export const SPB_CITY = "Санкт-Петербург";

/** Значения `?place=`; `all` — по умолчанию, из адреса вырезается. */
export const PLACE_FILTERS = ["all", "spb", "russia"] as const;
export type PlaceFilter = (typeof PLACE_FILTERS)[number];
export const DEFAULT_PLACE_FILTER: PlaceFilter = "all";

export const PLACE_FILTER_LABELS: Record<PlaceFilter, string> = {
  all: "Все",
  spb: "Санкт-Петербург",
  russia: "Россия",
};

/** Значения `?age=`; `all` — по умолчанию, из адреса вырезается. */
export const AGE_FILTERS = ["all", "9-10", "u13", "u15", "u17", "u19", "adult"] as const;
export type AgeFilter = (typeof AGE_FILTERS)[number];
export const DEFAULT_AGE_FILTER: AgeFilter = "all";

export const AGE_FILTER_LABELS: Record<AgeFilter, string> = {
  all: "Все возрасты",
  "9-10": "9–10 лет",
  u13: "до 13 лет",
  u15: "до 15 лет",
  u17: "до 17 лет",
  u19: "до 19 лет",
  adult: "Взрослые",
};

const AGE_BY_FILTER: Record<Exclude<AgeFilter, "all">, TournamentAge> = {
  "9-10": "9-10",
  u13: "до 13",
  u15: "до 15",
  u17: "до 17",
  u19: "до 19",
  adult: "взрослые",
};

/**
 * «Санкт-Петербург» — город записи, из любого календаря; «Россия» — признак
 * всероссийского или международного соревнования, в любом городе. Одна запись
 * может попасть в оба фильтра.
 */
export function matchesPlace(tournament: Tournament, place: PlaceFilter): boolean {
  switch (place) {
    case "all":
      return true;
    case "spb":
      return tournament.city === SPB_CITY;
    case "russia":
      return tournament.russia;
  }
}

/** Запись видна, если среди её возрастов есть выбранный. */
export function matchesAge(tournament: Tournament, age: AgeFilter): boolean {
  return age === "all" || tournament.ages.includes(AGE_BY_FILTER[age]);
}
