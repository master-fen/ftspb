import { SECTION_CATEGORIES, type SectionCategory } from "@/lib/section-category";

type CategoryFilterChipsProps = {
  active: SectionCategory;
  onSelect: (value: SectionCategory) => void;
  labels: Record<SectionCategory, string>;
};

/**
 * Чипы фильтра по разделам — разметка со страницы /news (news.index.tsx),
 * общая для новостей и документов. Порядок чипов — SECTION_CATEGORIES.
 */
export function CategoryFilterChips({ active, onSelect, labels }: CategoryFilterChipsProps) {
  return (
    <div
      role="group"
      aria-label="Фильтр по разделам"
      className="mb-8 flex flex-wrap gap-2 md:mb-10"
    >
      {SECTION_CATEGORIES.map((value) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-brand-navy text-brand-navy-foreground"
                : "bg-muted text-brand-navy hover:bg-brand-orange/10 hover:text-brand-orange"
            }`}
          >
            {labels[value]}
          </button>
        );
      })}
    </div>
  );
}
