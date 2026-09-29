import { Link } from "@tanstack/react-router";
import { SearchHighlight } from "@/components/site/SearchHighlight";
import { SEARCH_ROW, SEARCH_ROW_LINK } from "@/components/site/search-row-classes";
import type { SearchEventRow as SearchEventRowData } from "@/lib/search-response";

/**
 * Строка события: дата (формат списка событий, уже отформатирована
 * сервером — `formatEventDateShort`), название-ссылка с подсветкой, место
 * (обычным текстом — задание не просит подсвечивать его), фрагмент повестки
 * с подсветкой.
 */
export function SearchEventRow({ row }: { row: SearchEventRowData }) {
  return (
    <li className={SEARCH_ROW}>
      <p className="ui-caption">
        {row.dateFormatted}
        {row.location ? ` · ${row.location}` : ""}
      </p>
      <h3 className="ui-card-title mt-1">
        <Link to={row.href} className={SEARCH_ROW_LINK}>
          <SearchHighlight spans={row.title} />
        </Link>
      </h3>
      {row.agendaFragment.length > 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          <SearchHighlight spans={row.agendaFragment} />
        </p>
      ) : null}
    </li>
  );
}
