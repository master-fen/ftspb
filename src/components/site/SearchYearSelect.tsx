import { useNavigate } from "@tanstack/react-router";

type SearchYearSelectProps = {
  /** Годы, за которые есть новости по этому запросу, по убыванию. Пустых лет нет. */
  years: readonly number[];
  active: number | "all";
};

/**
 * Переключатель года — нативный `<select>`, не ссылки: без JS работать не
 * обязан (в отличие от вкладок и порядка). Смена ведёт по адресу через
 * `navigate` и сбрасывает страницу на первую.
 */
export function SearchYearSelect({ years, active }: SearchYearSelectProps) {
  const navigate = useNavigate({ from: "/search" });

  if (years.length === 0) return null;

  return (
    <label className="flex items-center gap-2 font-ui ui-caption">
      Год
      <select
        value={active === "all" ? "all" : String(active)}
        onChange={(event) => {
          const value = event.target.value;
          const year = value === "all" ? ("all" as const) : Number(value);
          void navigate({
            search: (current) => ({ ...current, year, page: 1 }),
            resetScroll: false,
          });
        }}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
      >
        <option value="all">Все годы</option>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </label>
  );
}
