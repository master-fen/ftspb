import { Link } from "@tanstack/react-router";
import { SearchHighlight } from "@/components/site/SearchHighlight";
import { resolveSearchHref } from "@/lib/search-href";
import type { SearchSectionRow as SearchSectionRowData } from "@/lib/search-response";

/**
 * Строка раздела сайта: название (с подсветкой), путь-крошки
 * («Федерация → Антидопинг»), фрагмент с подсветкой, ссылка. Пункт Устава
 * ведёт на якорь конкретного пункта — `href` приходит с сервера одной
 * строкой `путь#якорь`, `resolveSearchHref` разбирает её на `to`/`hash`
 * (объединённая строка в `to` у `Link` не работает как обычный href).
 */
export function SearchSectionRow({ row }: { row: SearchSectionRowData }) {
  const target = resolveSearchHref(row.href);

  return (
    <li className="border-b border-border py-4 last:border-b-0">
      {row.breadcrumb.length > 0 ? (
        <p className="ui-caption">{row.breadcrumb.join(" → ")}</p>
      ) : null}
      <h3 className="ui-card-title mt-1">
        <Link to={target.to} hash={target.hash} className="ui-link">
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
