import { describe, expect, test } from "bun:test";
import { TOURNAMENT_SOURCES, type Tournament } from "@/data/tournaments";
import {
  filterTournaments,
  formatTournamentAge,
  formatTournamentDates,
  formatTournamentPlace,
  formatTournamentSource,
  splitIntoBlocks,
  tournamentStatus,
  tournamentYears,
} from "@/lib/tournament-calendar";
import {
  matchesAge,
  matchesPlace,
  type AgeFilter,
  type PlaceFilter,
} from "@/lib/tournament-filters";

function make(fields: Partial<Tournament> & Pick<Tournament, "start" | "end">): Tournament {
  return {
    sources: ["ftr-2026"],
    ages: ["до 15"],
    title: "ВС",
    city: "Казань",
    russia: true,
    ...fields,
  };
}

const SPB_LOCAL = make({
  sources: ["spb-2026"],
  start: "2026-09-14",
  end: "2026-09-20",
  ages: ["9-10", "до 17"],
  title: "Невская осень",
  city: "Санкт-Петербург",
  venue: "СЦ «Динамит»",
  russia: false,
});
const SPB_RUSSIA = make({
  sources: ["spb-2026", "ftr-2026"],
  start: "2026-11-02",
  end: "2026-11-08",
  ages: ["взрослые"],
  city: "Санкт-Петербург",
  venue: "«Территория спорта»",
});
const KAZAN = make({ start: "2026-11-02", end: "2026-11-08", ages: ["до 13", "до 15", "до 17"] });
const TOSNO = make({ start: "2026-04-13", end: "2026-04-19", title: "СЗФО", city: "Тосно" });

describe("фильтр места", () => {
  test.each([
    ["«Все» — запись СПб без признака «Россия»", SPB_LOCAL, "all", true],
    ["«Санкт-Петербург» — город СПб из календаря СПб", SPB_LOCAL, "spb", true],
    ["«Санкт-Петербург» — город СПб из календаря ФТР", SPB_RUSSIA, "spb", true],
    ["«Санкт-Петербург» — Тосно не попадает", TOSNO, "spb", false],
    ["«Россия» — всероссийское в Казани", KAZAN, "russia", true],
    ["«Россия» — всероссийское в СПб (запись в обоих фильтрах)", SPB_RUSSIA, "russia", true],
    ["«Россия» — турнир календаря СПб без признака не попадает", SPB_LOCAL, "russia", false],
  ] as [string, Tournament, PlaceFilter, boolean][])("%s", (_name, tournament, place, expected) => {
    expect(matchesPlace(tournament, place)).toBe(expected);
  });
});

describe("фильтр возраста", () => {
  test.each([
    ["«Все возрасты» — любая запись", SPB_LOCAL, "all", true],
    ["«9–10 лет» — среди возрастов есть 9-10", SPB_LOCAL, "9-10", true],
    ["«до 17 лет» — второй из двух возрастов", SPB_LOCAL, "u17", true],
    ["«до 15 лет» — между возрастами записи, но не среди них", SPB_LOCAL, "u15", false],
    ["«до 13 лет» — первый из трёх возрастов", KAZAN, "u13", true],
    ["«до 19 лет» — нет среди трёх возрастов", KAZAN, "u19", false],
    ["«Взрослые» — взрослые", SPB_RUSSIA, "adult", true],
    ["«Взрослые» — юношеский турнир не попадает", TOSNO, "adult", false],
  ] as [string, Tournament, AgeFilter, boolean][])("%s", (_name, tournament, age, expected) => {
    expect(matchesAge(tournament, age)).toBe(expected);
  });
});

describe("фильтр года", () => {
  const next = make({ sources: ["ftr-2027"], start: "2027-01-11", end: "2027-01-17" });
  const all = [SPB_LOCAL, next, TOSNO];

  test("год — по дате начала: 2026 без записи 2027", () => {
    expect(filterTournaments(all, { year: 2026, place: "all", age: "all" })).toEqual([
      SPB_LOCAL,
      TOSNO,
    ]);
  });

  test("год 2027 — только запись 2027", () => {
    expect(filterTournaments(all, { year: 2027, place: "all", age: "all" })).toEqual([next]);
  });

  test("три фильтра вместе: 2026, СПб, 9–10 лет", () => {
    expect(filterTournaments(all, { year: 2026, place: "spb", age: "9-10" })).toEqual([SPB_LOCAL]);
  });

  test("годы в данных — без повторов, по возрастанию", () => {
    expect(tournamentYears([next, SPB_LOCAL, TOSNO])).toEqual([2026, 2027]);
  });
});

describe("статус по дате по Москве", () => {
  test.each([
    ["день до начала — впереди", "2026-09-13", "upcoming"],
    ["день начала — идёт", "2026-09-14", "ongoing"],
    ["день конца — идёт", "2026-09-20", "ongoing"],
    ["день после конца — завершён", "2026-09-21", "finished"],
  ])("%s", (_name, today, expected) => {
    expect(tournamentStatus(SPB_LOCAL, today)).toBe(
      expected as ReturnType<typeof tournamentStatus>,
    );
  });
});

describe("деление на блоки и порядок", () => {
  const sepEarly = make({ start: "2026-09-07", end: "2026-09-13", title: "А" });
  const sepOngoing = make({ start: "2026-09-28", end: "2026-10-04", title: "Б" });
  const octAdult = make({ start: "2026-10-05", end: "2026-10-11", ages: ["взрослые"], title: "А" });
  const octYoungB = make({ start: "2026-10-05", end: "2026-10-11", ages: ["до 13"], title: "Б" });
  const octYoungA = make({
    start: "2026-10-05",
    end: "2026-10-11",
    ages: ["до 17", "до 13"],
    title: "А",
  });
  const augLate = make({ start: "2026-08-31", end: "2026-09-06", title: "В" });
  const augEarly = make({ start: "2026-08-03", end: "2026-08-09", title: "Г" });
  const list = [octAdult, augEarly, sepOngoing, octYoungB, sepEarly, octYoungA, augLate];
  const today = "2026-10-02";

  const flat = (groups: { tournaments: Tournament[] }[]) => groups.flatMap((g) => g.tournaments);

  test("предстоящие: идущий и будущие, от ранних к поздним", () => {
    const { upcoming } = splitIntoBlocks(list, today);
    expect(flat(upcoming)).toEqual([sepOngoing, octYoungA, octYoungB, octAdult]);
  });

  test("одна дата начала: по младшему возрасту, затем по названию", () => {
    // octYoungA и octYoungB — младший возраст «до 13» у обоих, решает название;
    // octAdult с названием «А» — после них: младший возраст старше.
    const { upcoming } = splitIntoBlocks([octAdult, octYoungB, octYoungA], today);
    expect(flat(upcoming)).toEqual([octYoungA, octYoungB, octAdult]);
  });

  test("завершённые: от последних к ранним", () => {
    const { finished } = splitIntoBlocks(list, today);
    expect(flat(finished)).toEqual([sepEarly, augLate, augEarly]);
  });

  test("месяцы — по дате начала, подпись без года", () => {
    const { upcoming, finished } = splitIntoBlocks(list, today);
    expect(upcoming.map((g) => g.label)).toEqual(["Сентябрь", "Октябрь"]);
    expect(finished.map((g) => [g.label, g.tournaments.length])).toEqual([
      ["Сентябрь", 1],
      ["Август", 2],
    ]);
  });

  test("всё завершено — блок «Предстоящие» пуст", () => {
    const { upcoming, finished } = splitIntoBlocks(list, "2026-12-31");
    expect(upcoming).toEqual([]);
    expect(flat(finished)).toHaveLength(list.length);
  });

  test("ничего не началось — блок «Завершённые» пуст", () => {
    const { upcoming, finished } = splitIntoBlocks(list, "2026-01-01");
    expect(finished).toEqual([]);
    expect(flat(upcoming)).toHaveLength(list.length);
  });
});

describe("формат сроков", () => {
  test.each([
    ["неделя в одном месяце", "2026-09-14", "2026-09-20", "14–20 сентября"],
    ["неделя через два месяца", "2026-09-28", "2026-10-04", "28 сентября — 4 октября"],
    ["неделя через границу года", "2027-12-27", "2028-01-02", "27 декабря — 2 января"],
    ["точные даты", "2027-02-19", "2027-02-21", "19–21 февраля"],
    ["один день", "2026-06-12", "2026-06-12", "12 июня"],
  ])("%s: %s — %s → %s", (_name, start, end, expected) => {
    expect(formatTournamentDates(start, end)).toBe(expected);
  });
});

describe("подписи строки", () => {
  test.each([
    ["9-10", "9–10 лет"],
    ["до 13", "до 13 лет"],
    ["до 19", "до 19 лет"],
    ["взрослые", "взрослые"],
  ] as const)("возраст %s → %s", (age, expected) => {
    expect(formatTournamentAge(age)).toBe(expected);
  });

  test("место с базой — «город, база»", () => {
    expect(formatTournamentPlace(SPB_LOCAL)).toBe("Санкт-Петербург, СЦ «Динамит»");
  });

  test("место без базы — только город", () => {
    expect(formatTournamentPlace(KAZAN)).toBe("Казань");
  });
});

describe("строки источников", () => {
  test.each([
    [
      "spb-2026",
      "Календарь турниров РТТ по Санкт-Петербургу, сентябрь — декабрь 2026 года. Версия от 01.10.2026.",
    ],
    [
      "ftr-2026",
      "Календарь всероссийских и международных соревнований ФТР на 2026 год. Версия от 28.05.2026.",
    ],
    [
      "ftr-2027",
      "Календарь всероссийских и международных соревнований ФТР на 2027 год. Проект от 22.09.2026, сроки могут измениться.",
    ],
  ])("%s", (key, expected) => {
    const source = TOURNAMENT_SOURCES.find((s) => s.key === key);
    expect(source).toBeDefined();
    expect(formatTournamentSource(source!)).toBe(expected);
  });

  test("порядок строк — spb-2026, ftr-2026, ftr-2027", () => {
    expect(TOURNAMENT_SOURCES.map((s) => s.key)).toEqual(["spb-2026", "ftr-2026", "ftr-2027"]);
  });
});
