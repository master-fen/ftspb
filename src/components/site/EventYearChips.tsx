import { Link } from "@tanstack/react-router";

type EventYearChipsProps = {
  /** Годы, где есть опубликованные события, по возрастанию. Пустых нет. */
  years: readonly number[];
  /** Год, который список показывает без `?year=`. Его чип ведёт на адрес без параметра. */
  defaultYear: number;
};

const CHIP = "rounded-full px-4 py-2 text-sm font-semibold transition-colors";
const CHIP_ACTIVE = "bg-brand-navy text-brand-navy-foreground";
const CHIP_IDLE = "bg-muted text-brand-navy hover:bg-brand-orange/10 hover:text-brand-orange";

/**
 * Чипы годов списка /federation/events. Вид — как у CategoryFilterChips, но
 * тот привязан к SectionCategory (тип, порядок SECTION_CATEGORIES, подпись
 * группы), поэтому отдельный компонент, а не правка его контракта.
 *
 * Чипы — ссылки, а не кнопки: страницы годов доступны без JS и поисковику.
 * Активный чип определяет сам Link (`aria-current="page"`, activeProps):
 * `exact` делает сравнение search точным, иначе чип года по умолчанию
 * (search `{}`) частично совпадал бы с любым `?year=`.
 */
export function EventYearChips({ years, defaultYear }: EventYearChipsProps) {
  return (
    <div role="group" aria-label="Выбор года" className="mb-8 flex flex-wrap gap-2 md:mb-10">
      {years.map((year) => (
        <Link
          key={year}
          to="/federation/events"
          search={year === defaultYear ? {} : { year }}
          resetScroll={false}
          activeOptions={{ exact: true }}
          className={CHIP}
          activeProps={{ className: CHIP_ACTIVE }}
          inactiveProps={{ className: CHIP_IDLE }}
        >
          {year}
        </Link>
      ))}
    </div>
  );
}
