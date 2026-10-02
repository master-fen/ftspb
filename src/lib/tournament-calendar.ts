/**
 * Календарь турниров (/tournaments): год, статус, деление на блоки, подписи.
 * Все функции чистые. Даты — строки `YYYY-MM-DD`, объекты `Date` не создаются
 * (причина — в шапке src/lib/event-date.ts); «сегодня» передаётся явно, это
 * `todayInMoscow` из loader страницы. Правила — docs/calendar.md. Фильтры
 * места и возраста — src/lib/tournament-filters.ts.
 */
import {
  TOURNAMENT_AGES,
  type Tournament,
  type TournamentAge,
  type TournamentSource,
} from "@/data/tournaments";
import {
  matchesAge,
  matchesPlace,
  type AgeFilter,
  type PlaceFilter,
} from "@/lib/tournament-filters";

/** Год записи — год даты начала. */
export function tournamentYear(tournament: Tournament): number {
  return Number(tournament.start.slice(0, 4));
}

/** Годы, которые есть в данных, по возрастанию. */
export function tournamentYears(tournaments: readonly Tournament[]): number[] {
  return [...new Set(tournaments.map(tournamentYear))].sort((a, b) => a - b);
}

export function filterTournaments(
  tournaments: readonly Tournament[],
  filters: { year: number; place: PlaceFilter; age: AgeFilter },
): Tournament[] {
  return tournaments.filter(
    (t) =>
      tournamentYear(t) === filters.year &&
      matchesPlace(t, filters.place) &&
      matchesAge(t, filters.age),
  );
}

export type TournamentStatus = "upcoming" | "ongoing" | "finished";

/** Идёт: начало ≤ сегодня ≤ конец; обе границы включительно. */
export function tournamentStatus(tournament: Tournament, today: string): TournamentStatus {
  if (today < tournament.start) return "upcoming";
  if (today > tournament.end) return "finished";
  return "ongoing";
}

/** Индекс младшего возраста записи в TOURNAMENT_AGES. */
function youngestAge(tournament: Tournament): number {
  return Math.min(...tournament.ages.map((age) => TOURNAMENT_AGES.indexOf(age)));
}

/**
 * Сравнение по кодам символов, а не `localeCompare`: порядок сортировки строк
 * зависит от ICU, и сервер с браузером могли бы разойтись при гидрации.
 * Для заглавных и строчных кириллических букв без «ё» порядок совпадает с
 * алфавитным.
 */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Турниры с одной датой начала — по младшему возрасту, затем по названию. */
function compareSameStart(a: Tournament, b: Tournament): number {
  return youngestAge(a) - youngestAge(b) || compareText(a.title, b.title);
}

export type MonthGroup = {
  /** `YYYY-MM` даты начала. */
  key: string;
  /** «Сентябрь» — без года. */
  label: string;
  tournaments: Tournament[];
};

export type TournamentBlocks = {
  /** Идут сейчас или ещё не начались — от ранних к поздним. */
  upcoming: MonthGroup[];
  /** Уже закончились — от последних к ранним. */
  finished: MonthGroup[];
};

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

function monthOf(isoDate: string): number {
  return Number(isoDate.slice(5, 7));
}

function dayOf(isoDate: string): number {
  return Number(isoDate.slice(8, 10));
}

/** Разбивка уже упорядоченного списка по месяцам даты начала, порядок сохраняется. */
function groupByMonth(sorted: readonly Tournament[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const tournament of sorted) {
    const key = tournament.start.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.key === key) {
      last.tournaments.push(tournament);
    } else {
      const name = MONTHS_NOMINATIVE[monthOf(tournament.start) - 1];
      groups.push({
        key,
        label: name.charAt(0).toUpperCase() + name.slice(1),
        tournaments: [tournament],
      });
    }
  }
  return groups;
}

/**
 * Деление на «Предстоящие» и «Завершённые». Внутри блока — по дате начала
 * (в завершённых — от последних), при равной дате начала — по младшему
 * возрасту, затем по названию; затем по месяцам даты начала.
 */
export function splitIntoBlocks(
  tournaments: readonly Tournament[],
  today: string,
): TournamentBlocks {
  const upcoming = tournaments
    .filter((t) => tournamentStatus(t, today) !== "finished")
    .sort((a, b) => compareText(a.start, b.start) || compareSameStart(a, b));
  const finished = tournaments
    .filter((t) => tournamentStatus(t, today) === "finished")
    .sort((a, b) => compareText(b.start, a.start) || compareSameStart(a, b));
  return { upcoming: groupByMonth(upcoming), finished: groupByMonth(finished) };
}

/**
 * Сроки без года: «14–20 сентября», «28 сентября — 4 октября», «14 сентября».
 * Внутри месяца — короткое тире без пробелов, через месяц — длинное с пробелами.
 */
export function formatTournamentDates(start: string, end: string): string {
  const startMonth = MONTHS_GENITIVE[monthOf(start) - 1];
  const endMonth = MONTHS_GENITIVE[monthOf(end) - 1];
  if (start === end) return `${dayOf(start)} ${startMonth}`;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${dayOf(start)}–${dayOf(end)} ${endMonth}`;
  return `${dayOf(start)} ${startMonth} — ${dayOf(end)} ${endMonth}`;
}

/** `9-10` → «9–10 лет», `до 13` → «до 13 лет», `взрослые` → «взрослые». */
export function formatTournamentAge(age: TournamentAge): string {
  if (age === "взрослые") return age;
  return `${age.replace("-", "–")} лет`;
}

/** «город, база»; база — если есть. */
export function formatTournamentPlace(tournament: Tournament): string {
  return tournament.venue ? `${tournament.city}, ${tournament.venue}` : tournament.city;
}

/**
 * Строка источника под вводной строкой страницы: «название[, период].
 * Версия от ДД.ММ.ГГГГ.» или «… Проект от ДД.ММ.ГГГГ, сроки могут измениться.»
 * Период пишется, только если календарь охватывает не весь год.
 */
export function formatTournamentSource(source: TournamentSource): string {
  let period = "";
  if (source.months !== null) {
    const from = MONTHS_NOMINATIVE[source.months.from - 1];
    const to = MONTHS_NOMINATIVE[source.months.to - 1];
    const range = source.months.from === source.months.to ? from : `${from} — ${to}`;
    period = `, ${range} ${source.year} года`;
  }
  const version =
    source.status === "проект"
      ? `Проект от ${source.versionDate}, сроки могут измениться.`
      : `Версия от ${source.versionDate}.`;
  return `${source.title}${period}. ${version}`;
}
