import { Link } from "@tanstack/react-router";
import { SECTION_CATEGORY_LABELS } from "@/lib/section-category";
import type { SearchNewsRow as SearchNewsRowData } from "@/lib/search-response";
import { SearchHighlight } from "@/components/site/SearchHighlight";

/**
 * Строка новости в результатах поиска: дата, раздел (кроме «Общее» —
 * `section === null`), заголовок-ссылка с подсветкой, фрагмент текста с
 * подсветкой. Без фото — не `NewsListCard`, роль другая (список поиска, не
 * карточка).
 */
export function SearchNewsRow({ row }: { row: SearchNewsRowData }) {
  const sectionLabel = row.section ? SECTION_CATEGORY_LABELS[row.section] : null;

  return (
    <li className="border-b border-border py-4 last:border-b-0">
      <p className="ui-caption">
        {row.dateFormatted}
        {sectionLabel ? ` · ${sectionLabel}` : ""}
      </p>
      <h3 className="ui-card-title mt-1">
        <Link to={row.href} className="ui-link">
          <SearchHighlight spans={row.title} />
        </Link>
      </h3>
      {row.fragment.length > 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          <SearchHighlight spans={row.fragment} />
        </p>
      ) : null}
    </li>
  );
}
