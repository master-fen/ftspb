import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { FederationMobileNav } from "@/components/site/FederationMobileNav";
import { NewsListCard } from "@/components/site/NewsListCard";
import { NewsPagination } from "@/components/site/NewsPagination";
import { listNewsPage } from "@/lib/news-server-fn";
import { pageSearchField } from "@/lib/news-page-search";

const TITLE = "Новости Федерации — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Официальные новости Федерации тенниса Санкт-Петербурга: решения Правления, собрания, события и объявления.";

/** `?page=` — как на /news; раздел здесь задан страницей, фильтра нет. */
const searchSchema = z.object({
  page: pageSearchField,
});

export const Route = createFileRoute("/_site/federation/news")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams({ page: 1 })],
  },
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ deps }) => listNewsPage({ data: { category: "federation", page: deps.page } }),
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
  const { items, page, pageCount } = Route.useLoaderData();

  return (
    <article>
      <h1 className="ui-h1">Новости Федерации</h1>
      <FederationMobileNav />

      {items.length === 0 ? (
        <p className="mt-8 rounded-xl bg-muted p-8 text-center text-muted-foreground">
          Пока нет новостей в этом разделе
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:gap-y-6">
          {items.map((item) => (
            <NewsListCard key={item.id} item={item} from="federation" />
          ))}
        </div>
      )}

      <NewsPagination page={page} pageCount={pageCount} />
    </article>
  );
}
