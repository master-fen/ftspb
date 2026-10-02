import { createFileRoute, notFound, stripSearchParams } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { NewsArticlePage, NewsError, NewsNotFound } from "@/components/site/NewsArticlePage";
import { getNewsArticle } from "@/lib/news-server-fn";
import { NEWS_ORIGINS } from "@/lib/news-origin";
import { buildNewsArticleJsonLd, serializeJsonLd } from "@/lib/news-jsonld";
import { OG_IMAGE_URL, SITE_NAME, SITE_URL, toAbsoluteUrl } from "@/lib/site";

/**
 * `?from=` — путь, которым пришли (см. src/lib/news-origin.ts). Невалидное
 * или отсутствующее значение → undefined (fallback), страница не падает;
 * отсутствие параметра вычищается из адреса (stripSearchParams).
 */
const searchSchema = z.object({
  from: fallback(z.enum(NEWS_ORIGINS).optional(), undefined).optional(),
});

export const Route = createFileRoute("/_site/news/$newsId")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams({ from: undefined })],
  },
  // Один вызов: новость, «Читайте также» и описание считает сервер —
  // список карточек на клиент не переносится.
  loader: async ({ params }) => {
    const article = await getNewsArticle({ data: params.newsId });
    if (!article) throw notFound();
    return article;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Новость не найдена — Федерация тенниса Санкт-Петербурга" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    // description — по правилу анонса с порогом 200 (src/lib/news-excerpt.ts),
    // сырой анонс бывает длиной 2900 знаков.
    const { item, description: desc } = loaderData;
    const image = toAbsoluteUrl(item.cover) ?? OG_IMAGE_URL;
    const url = `${SITE_URL}/news/${item.id}`;
    // Машиночитаемые даты — только при наличии (мок-фикстуры без БД их не имеют).
    const jsonLd = buildNewsArticleJsonLd({
      title: item.title,
      description: desc,
      url,
      image,
      datePublished: item.publishedAtIso,
      dateModified: item.updatedAtIso,
      publisherName: SITE_NAME,
    });

    return {
      meta: [
        { title: `${item.title} — Федерация тенниса Санкт-Петербурга` },
        { name: "description", content: desc },
        { property: "og:title", content: item.title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        ...(item.publishedAtIso
          ? [{ property: "article:published_time", content: item.publishedAtIso }]
          : []),
        ...(item.updatedAtIso
          ? [{ property: "article:modified_time", content: item.updatedAtIso }]
          : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: item.title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: jsonLd ? [{ type: "application/ld+json", children: serializeJsonLd(jsonLd) }] : [],
    };
  },

  notFoundComponent: NewsNotFound,
  errorComponent: NewsError,
  component: NewsDetailPage,
});

/** Вид страницы — общий с предпросмотром редактора (src/components/site/NewsArticlePage.tsx). */
function NewsDetailPage() {
  const { item, related } = Route.useLoaderData();
  const { from } = Route.useSearch();
  return <NewsArticlePage item={item} related={related} from={from} routePath="/news/$newsId" />;
}
