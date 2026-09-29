import { Link } from "@tanstack/react-router";
import type { SearchSort } from "@/lib/search-params";

const CHIP = "rounded-full px-4 py-2 text-sm font-semibold transition-colors";
const CHIP_ACTIVE = "bg-chip-active text-brand-navy-foreground";
const CHIP_IDLE = "bg-muted text-brand-navy hover:bg-chip-hover hover:text-brand-orange";

const SORT_LABEL: Record<SearchSort, string> = {
  relevance: "Сначала подходящие",
  date: "Сначала новые",
};

/**
 * Переключатель порядка новостей — две ссылки-чипа, того же вида, что
 * вкладки (`SearchTabs`): доступен без JS. Смена порядка сбрасывает
 * страницу на первую.
 */
export function SearchSortChips({ active }: { active: SearchSort }) {
  const sorts: SearchSort[] = ["relevance", "date"];
  return (
    <div role="group" aria-label="Порядок новостей" className="flex flex-wrap gap-2">
      {sorts.map((sort) => (
        <Link
          key={sort}
          to="/search"
          search={(current) => ({ ...current, sort, page: 1 })}
          resetScroll={false}
          className={sort === active ? `${CHIP} ${CHIP_ACTIVE}` : `${CHIP} ${CHIP_IDLE}`}
          aria-current={sort === active ? "page" : undefined}
        >
          {SORT_LABEL[sort]}
        </Link>
      ))}
    </div>
  );
}
