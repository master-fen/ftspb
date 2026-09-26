import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocumentParents } from "@/lib/documents-server-fn";
import { formatEventDateLong } from "@/lib/event-date";
import { formatIsoDateRu } from "@/lib/format-iso-date";

type Parent = Awaited<ReturnType<typeof getDocumentParents>>[number];

function parentDate(parent: Parent): string {
  return parent.datePrecision === null
    ? formatIsoDateRu(parent.date)
    : formatEventDateLong(parent.date, parent.datePrecision);
}

function statusLabel(parent: Parent): string {
  if (parent.kind === "news") {
    return parent.status === "published" ? "Опубликована" : "Черновик";
  }
  return parent.status === "published" ? "Опубликовано" : "Черновик";
}

function ParentLink({ parent }: { parent: Parent }) {
  const className = "font-medium text-foreground underline-offset-4 hover:underline";
  return parent.kind === "news" ? (
    <Link to="/admin/news/$id" params={{ id: parent.id }} className={className}>
      {parent.title}
    </Link>
  ) : (
    <Link to="/admin/events/$id" params={{ id: parent.id }} className={className}>
      {parent.title}
    </Link>
  );
}

/**
 * «Приложен к»: новости и события, к которым привязан документ. Мягко
 * удалённые показываются с пометкой «Удалена/Удалено» — связь с ними жива и
 * вернётся вместе с восстановлением родителя.
 */
export function DocumentAttachedTo({ documentId }: { documentId: string }) {
  const query = useQuery({
    queryKey: ["admin-document-parents", documentId],
    queryFn: () => getDocumentParents({ data: documentId }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Приложен к</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-destructive">Не удалось загрузить связи документа.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Повторить
            </Button>
          </div>
        ) : query.isPending ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : query.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ни к чему не приложен</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {query.data.map((parent) => (
              <li key={`${parent.kind}-${parent.id}`} className="flex flex-col gap-1">
                <ParentLink parent={parent} />
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{parent.kind === "news" ? "Новость" : "Событие"}</span>
                  <span>{parentDate(parent)}</span>
                  <Badge variant={parent.status === "published" ? "default" : "secondary"}>
                    {statusLabel(parent)}
                  </Badge>
                  {parent.deleted ? (
                    <Badge variant="outline">
                      {parent.kind === "news" ? "Удалена" : "Удалено"}
                    </Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
