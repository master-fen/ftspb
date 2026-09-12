import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NewsListCard } from "@/components/site/NewsListCard";
import { listNews } from "@/lib/news-server-fn";
import { sortNewsByDateDesc } from "@/lib/news-date";

const TITLE = "Новости Федерации — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Официальные новости Федерации тенниса Санкт-Петербурга: решения Правления, собрания, события и объявления.";

export const Route = createFileRoute("/_site/federation/news")({
  loader: () => listNews(),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: FederationNewsPage,
});

/**
 * SiteHeader, SiteFooter, хлебные крошки и боковое меню рисует макет раздела
 * (src/routes/_site.federation.tsx) — здесь только содержимое колонки.
 */
function FederationNewsPage() {
  const news = Route.useLoaderData();

  const items = useMemo(
    () => sortNewsByDateDesc(news).filter((n) => n.section === "federation"),
    [news],
  );

  return (
    <article>
      <h1 className="ui-h1">Новости Федерации</h1>

      {items.length === 0 ? (
        <p className="mt-8 rounded-xl bg-muted p-8 text-center text-muted-foreground">
          Пока нет новостей в этом разделе
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:gap-6">
          {items.map((item) => (
            <NewsListCard key={item.id} item={item} from="federation" />
          ))}
        </div>
      )}
    </article>
  );
}
