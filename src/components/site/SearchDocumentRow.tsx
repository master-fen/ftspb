import { Link } from "@tanstack/react-router";
import { DocumentFileRow } from "@/components/site/DocumentFileRow";
import { SearchHighlight } from "@/components/site/SearchHighlight";
import { documentBadge } from "@/lib/document-badge";
import { resolveSearchHref } from "@/lib/search-href";
import type { SearchDocumentRow as SearchDocumentRowData } from "@/lib/search-response";

/**
 * Строка документа в результатах поиска: `DocumentFileRow` (значок типа,
 * название с подсветкой, дата, размер) плюс, для документа вне общего
 * списка (`parent !== null`), строка «в новости/событии «…», ДАТА» под ней
 * со ссылкой на родителя.
 */
export function SearchDocumentRow({ row }: { row: SearchDocumentRowData }) {
  const target = resolveSearchHref(row.href);

  return (
    <li>
      <DocumentFileRow
        badge={documentBadge(row.mimeType, row.fileName)}
        action={<SearchHighlight spans={row.title} />}
        meta={row.dateFormatted}
        href={target.to}
        external={target.external}
        wrapTitle
        sizeBytes={row.sizeBytes}
      />
      {row.parent ? (
        <p className="mt-1 px-3 ui-caption">
          в {row.parent.kind === "news" ? "новости" : "событии"} «
          <Link to={row.parent.href} className="ui-link">
            {row.parent.title}
          </Link>
          », {row.parent.dateFormatted}
        </p>
      ) : null}
    </li>
  );
}
