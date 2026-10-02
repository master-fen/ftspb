import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  NewsArticlePage,
  NewsError,
  NewsNotFound,
  NewsPreviewLocked,
} from "@/components/site/NewsArticlePage";
import { previewTitle } from "@/lib/news-preview";
import { getNewsPreview } from "@/lib/news-preview-server-fn";

/**
 * Предпросмотр новости редактором: `/news/preview/ID`, ID — `news.id` (uuid).
 * Вид — тот же `<main>`, что у `/news/$newsId` (src/components/site/NewsArticlePage.tsx);
 * полосу-пометку над ним рисует рама `_site.tsx`. Публичной страницей не
 * является: в sitemap.xml и search-registry.ts её нет (docs/decisions.md).
 *
 * Доступ решает серверная функция (`getNewsPreview`, src/server/news.ts): без
 * сессии — заглушка без данных новости, мусорный или неизвестный ID — 404.
 */
export const Route = createFileRoute("/_site/news/preview/$previewId")({
  loader: async ({ params }) => {
    const preview = await getNewsPreview({ data: params.previewId });
    if (preview.kind === "not-found") throw notFound();
    return preview;
  },
  // Ответ зависит от cookie сессии: кэширующий посредник не должен отдать
  // страницу черновика другому посетителю.
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Новость не найдена — Федерация тенниса Санкт-Петербурга" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    if (loaderData.kind === "unauthorized") {
      return {
        meta: [
          { title: "Предпросмотр — Федерация тенниса Санкт-Петербурга" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    // Без canonical, og/twitter новости и JSON-LD: страница не для поисковиков и соцсетей.
    return {
      meta: [
        { title: previewTitle(loaderData.state, loaderData.article.item.title) },
        { name: "robots", content: "noindex, nofollow" },
      ],
    };
  },

  notFoundComponent: NewsNotFound,
  errorComponent: NewsError,
  component: NewsPreviewPage,
});

function NewsPreviewPage() {
  const preview = Route.useLoaderData();
  const { previewId } = Route.useParams();
  if (preview.kind !== "ok") return <NewsPreviewLocked newsId={previewId} />;
  const { item, related } = preview.article;
  return (
    <NewsArticlePage
      item={item}
      related={related}
      from={undefined}
      routePath="/news/preview/$previewId"
    />
  );
}
