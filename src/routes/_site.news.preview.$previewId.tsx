import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import {
  NewsArticlePage,
  NewsError,
  NewsNotFound,
  NewsPreviewLocked,
  NewsShareLinkInvalid,
} from "@/components/site/NewsArticlePage";
import { previewTitle, shareKeyParam } from "@/lib/news-preview";
import { getNewsPreview } from "@/lib/news-preview-server-fn";

/**
 * Предпросмотр новости редактором: `/news/preview/ID`, ID — `news.id` (uuid).
 * С ключом (`?key=ТОКЕН`) — та же страница для согласующего без входа.
 * Вид — тот же `<main>`, что у `/news/$newsId` (src/components/site/NewsArticlePage.tsx);
 * полосу-пометку над ним рисует рама `_site.tsx`. Публичной страницей не
 * является: в sitemap.xml и search-registry.ts её нет (docs/decisions.md).
 *
 * Доступ решает серверная функция (`getNewsPreview`, src/server/news.ts): без
 * сессии и ключа — заглушка без данных новости, с неверным ключом — одна и та
 * же заглушка «ссылка недействительна», мусорный ID — 404.
 */

/** Адрес ответа содержит ключ: ни внешние ссылки текста, ни картинки и видео не получают его в Referer. */
const NO_REFERRER = { name: "referrer", content: "no-referrer" };

export const Route = createFileRoute("/_site/news/preview/$previewId")({
  // Search проходит как есть: на сервере роутер сверяет адрес, собранный из
  // результата `validateSearch`, с адресом запроса и при расхождении
  // перенаправляет (router-core, `beforeLoad`). Любая подмена значения
  // ключа дала бы лишний 307.
  validateSearch: (search: Record<string, unknown>) => search as { key?: unknown },
  loaderDeps: ({ search }) => ({ key: shareKeyParam(search.key) }),
  loader: async ({ params, deps }) => {
    const preview = await getNewsPreview({ data: { id: params.previewId, key: deps.key } });
    if (preview.kind === "not-found") throw notFound();
    // Опубликованная новость по годной ссылке — на публичный адрес; токен
    // при публикации не стирается.
    if (preview.kind === "redirect") {
      throw redirect({ to: "/news/$newsId", params: { newsId: preview.slug } });
    }
    return preview;
  },
  // Ответ зависит от cookie сессии и ключа: кэширующий посредник не должен
  // отдать страницу черновика другому посетителю.
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Новость не найдена — Федерация тенниса Санкт-Петербурга" },
          { name: "robots", content: "noindex" },
          NO_REFERRER,
        ],
      };
    }
    if (loaderData.kind === "unauthorized") {
      return {
        meta: [
          { title: "Предпросмотр — Федерация тенниса Санкт-Петербурга" },
          { name: "robots", content: "noindex" },
          NO_REFERRER,
        ],
      };
    }
    if (loaderData.kind === "link-invalid") {
      return {
        meta: [
          { title: "Ссылка недействительна — Федерация тенниса Санкт-Петербурга" },
          { name: "robots", content: "noindex" },
          NO_REFERRER,
        ],
      };
    }
    // Без canonical, og/twitter новости и JSON-LD: страница не для поисковиков и соцсетей.
    const state = loaderData.kind === "shared" ? "draft" : loaderData.state;
    return {
      meta: [
        { title: previewTitle(state, loaderData.article.item.title) },
        { name: "robots", content: "noindex, nofollow" },
        NO_REFERRER,
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
  if (preview.kind === "unauthorized") return <NewsPreviewLocked newsId={previewId} />;
  if (preview.kind === "link-invalid") return <NewsShareLinkInvalid />;
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
