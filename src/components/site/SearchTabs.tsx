import { Link } from "@tanstack/react-router";
import type { SearchTab } from "@/lib/search-params";

const CHIP = "rounded-full px-4 py-2 text-sm font-semibold transition-colors";
const CHIP_ACTIVE = "bg-chip-active text-brand-navy-foreground";
const CHIP_IDLE = "bg-muted text-brand-navy hover:bg-chip-hover hover:text-brand-orange";

const TAB_ORDER: SearchTab[] = ["all", "news", "documents", "events", "sections"];

const TAB_LABEL: Record<SearchTab, string> = {
  all: "Всё",
  news: "Новости",
  documents: "Документы",
  events: "События",
  sections: "Разделы сайта",
};

type SearchTabsProps = {
  active: SearchTab;
  counts: { news: number; documents: number; events: number; sections: number };
};

/**
 * Вкладки типа находок — ссылки, как `EventYearChips`, не кнопки:
 * доступны без JS и поисковику. Вкладка с нулём находок не показывается,
 * «Всё» — всегда. Числа — только у остальных вкладок, у «Всё» числа нет
 * (задание). Смена вкладки сбрасывает страницу на первую.
 */
export function SearchTabs({ active, counts }: SearchTabsProps) {
  const visible = TAB_ORDER.filter((tab) => tab === "all" || counts[tab] > 0);

  return (
    <div role="group" aria-label="Тип находок" className="mb-6 flex flex-wrap gap-2">
      {visible.map((tab) => (
        <Link
          key={tab}
          to="/search"
          search={(current) => ({ ...current, tab, page: 1 })}
          resetScroll={false}
          activeOptions={{ exact: true }}
          className={tab === active ? `${CHIP} ${CHIP_ACTIVE}` : `${CHIP} ${CHIP_IDLE}`}
          aria-current={tab === active ? "page" : undefined}
        >
          {TAB_LABEL[tab]}
          {tab === "all" ? "" : ` ${counts[tab]}`}
        </Link>
      ))}
    </div>
  );
}
