type CategoryFilterChipsProps<T extends string> = {
  /** Чипы по порядку: NEWS_SECTION_CATEGORIES или DOCUMENT_SECTION_CATEGORIES. */
  categories: readonly T[];
  active: T;
  onSelect: (value: T) => void;
  labels: Record<T, string>;
  /** Подпись группы для скринридера. */
  ariaLabel?: string;
  /**
   * Отступ под рядом: `section` — один ряд над списком; `stack` — ряд в стопке
   * рядов (календарь турниров), отступы задаёт обёртка стопки.
   */
  spacing?: "section" | "stack";
};

/**
 * Чипы фильтра — разметка со страницы /news (news.index.tsx), общая для
 * новостей, документов и календаря турниров; набор и порядок чипов задаёт
 * страница.
 */
export function CategoryFilterChips<T extends string>({
  categories,
  active,
  onSelect,
  labels,
  ariaLabel = "Фильтр по разделам",
  spacing = "section",
}: CategoryFilterChipsProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={
        spacing === "section" ? "mb-8 flex flex-wrap gap-2 md:mb-10" : "flex flex-wrap gap-2"
      }
    >
      {categories.map((value) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-chip-active text-brand-navy-foreground"
                : "bg-muted text-brand-navy hover:bg-chip-hover hover:text-brand-orange"
            }`}
          >
            {labels[value]}
          </button>
        );
      })}
    </div>
  );
}
