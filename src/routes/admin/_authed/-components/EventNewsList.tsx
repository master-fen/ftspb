import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatIsoDateRu } from "@/lib/format-iso-date";
import { listAdminNewsForEvent } from "@/lib/news-admin-server-fn";

/**
 * «Новости события»: новости, у которых в поле «Событие» выбрано это событие.
 * Раздел только читает — привязка и отвязка живут в редакторе новости.
 * Черновики показываются, удалённые — нет (src/server/news-admin.ts).
 */
export function EventNewsList({ eventId }: { eventId: string }) {
  const query = useQuery({
    queryKey: ["admin-event-news", eventId],
    queryFn: () => listAdminNewsForEvent({ data: eventId }),
  });

  return (
    <section className="rounded-xl border bg-card p-5 md:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Newspaper className="h-5 w-5" />
        Новости события
      </h2>
      {query.isError ? (
        <div className="mt-4 flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">Не удалось загрузить новости события.</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Повторить
          </Button>
        </div>
      ) : query.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Загрузка…</p>
      ) : query.data.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Новостей пока нет. Событие выбирается в редакторе новости, поле «Событие».
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {query.data.map((item) => (
            <li key={item.id} className="flex flex-col gap-1">
              <Link
                to="/admin/news/$id"
                params={{ id: item.id }}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {item.title}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{formatIsoDateRu(item.publishedAt)}</span>
                <Badge variant={item.status === "published" ? "default" : "secondary"}>
                  {item.status === "published" ? "Опубликована" : "Черновик"}
                </Badge>
                {item.status === "published" ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/news/$newsId" params={{ newsId: item.slug }} target="_blank">
                      <ExternalLink className="h-4 w-4" />
                      На сайте
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
