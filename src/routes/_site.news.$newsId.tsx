import { createFileRoute, Link, notFound, stripSearchParams } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Download, FileText } from "lucide-react";
import { Breadcrumbs, type Crumb } from "@/components/site/Breadcrumbs";
import { NewsGallery } from "@/components/site/NewsGallery";
import { NewsVideo } from "@/components/site/NewsVideo";
import { NewsBody } from "@/components/site/NewsBody";
import { getNewsBySlug, listNews } from "@/lib/news-server-fn";
import type { NewsItem } from "@/lib/types/news";
import { newsMetaLine } from "@/lib/news-meta";
import { NEWS_ORIGINS } from "@/lib/news-origin";
import { pickRelatedNews } from "@/lib/news-related";
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
  loader: async ({ params }) => {
    const item = await getNewsBySlug({ data: params.newsId });
    if (!item) throw notFound();
    const all = await listNews();
    const related = pickRelatedNews(all, item);
    return { item, related };
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
    const { item } = loaderData;
    const desc = item.excerpt ?? item.title;
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

/** Крошки отражают путь, которым пришли (`?from=`), а не раздел новости. */
const CRUMBS_DEFAULT: Crumb[] = [
  { label: "Главная", href: "/" },
  { label: "Новости", href: "/news" },
];
const CRUMBS_FEDERATION: Crumb[] = [
  { label: "Главная", href: "/" },
  { label: "Федерация", href: "/federation" },
  { label: "Новости Федерации", href: "/federation/news" },
];

function NewsDetailPage() {
  const { item, related } = Route.useLoaderData();
  const { from } = Route.useSearch();
  const crumbs = from === "federation" ? CRUMBS_FEDERATION : CRUMBS_DEFAULT;

  // Не показываем анонс, если он дублирует начало текста новости.
  const normalize = (s: string) =>
    s
      .replace(/<[^>]*>/g, " ")
      .replace(/[«»"'“”]/g, "")
      .replace(/[…]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const excerptNorm = item.excerpt ? normalize(item.excerpt) : "";
  const bodyNorm = item.body ? normalize(item.body) : "";
  const probe = excerptNorm.slice(0, 60);
  const showLead = Boolean(excerptNorm && !(probe.length > 20 && bodyNorm.startsWith(probe)));
  // Флаг news.hide_cover_on_page прячет обложку только здесь; карточки и og:image (head) читают item.cover.
  const pageCover = item.hideCoverOnPage ? undefined : item.cover;

  return (
    <main className="mx-auto max-w-7xl px-4 pt-6 pb-14 md:px-6 md:pt-8 md:pb-20 lg:px-10">
      <Breadcrumbs items={[...crumbs, { label: item.title }]} />

      <header className="mt-5 md:mt-7 lg:max-w-[calc(100%-304px)] xl:max-w-[calc(100%-440px)]">
        <div className="text-[11px] font-semibold tracking-[0.14em] text-brand-orange uppercase">
          {newsMetaLine(item.category, item.date)}
        </div>
        <h1 className="mt-3 ui-h1">{item.title}</h1>
        {showLead ? (
          <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground md:text-lg">
            {item.excerpt}
          </p>
        ) : null}
      </header>

      <div className="mt-7 grid grid-cols-1 gap-10 md:mt-8 lg:grid-cols-[minmax(0,1fr)_264px] xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-[120px]">
        {/* Main column */}
        <div className="min-w-0 space-y-8">
          {item.videoUrl ? <NewsVideo src={item.videoUrl} title={item.title} /> : null}

          {pageCover || item.gallery?.length ? (
            <NewsGallery cover={pageCover} gallery={item.gallery ?? []} title={item.title} />
          ) : null}

          {item.body ? <NewsBody body={item.body} /> : null}

          {item.attachments && item.attachments.length > 0 ? (
            <section>
              <div className="h-px w-full bg-brand-navy/25" />
              <h2 className="mt-6 ui-h2">Прикреплённые файлы</h2>
              <ul className="mt-4 space-y-2">
                {item.attachments.map(
                  (att: NonNullable<NewsItem["attachments"]>[number], i: number) => (
                    <li key={i}>
                      <a
                        href={att.url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3 ring-1 ring-black/5 ui-link-row"
                      >
                        <FileText className="h-5 w-5 text-brand-navy/70" aria-hidden />
                        <span className="rounded-md bg-brand-navy px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
                          {att.kind}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {att.title}
                        </span>
                        {att.size ? (
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            {att.size}
                          </span>
                        ) : null}
                        <Download
                          className="h-4 w-4 text-brand-navy/60 transition-colors group-hover:text-brand-orange"
                          aria-hidden
                        />
                      </a>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-2xl bg-muted/70 p-6 ring-1 ring-black/5">
            <h2 className="text-sm font-bold tracking-wide text-foreground/80">Читайте также</h2>
            <ul className="mt-5 space-y-5">
              {related.map((r: NewsItem) => (
                <RelatedItem key={r.id} item={r} />
              ))}
            </ul>
            <div className="mt-6 border-t border-brand-navy/15 pt-4">
              <Link
                to="/news"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-navy ui-link"
              >
                <span aria-hidden>←</span> Ко всем новостям
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function RelatedItem({ item }: { item: NewsItem }) {
  return (
    <li>
      <Link
        to="/news/$newsId"
        params={{ newsId: item.id }}
        className="block text-foreground ui-link"
      >
        <div className="text-[10px] font-semibold tracking-[0.14em] text-brand-orange uppercase">
          {newsMetaLine(item.category, item.date)}
        </div>
        <div className="mt-1 text-sm leading-snug font-semibold">{item.title}</div>
      </Link>
    </li>
  );
}

function NewsNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
      <p className="text-sm font-semibold tracking-wide text-brand-orange uppercase">404</p>
      <h1 className="mt-3 ui-h1">Новость не найдена</h1>
      <p className="mt-4 text-muted-foreground">Возможно, материал был перемещён или удалён.</p>
      <Link
        to="/news"
        className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-5 py-2.5 text-sm font-semibold text-brand-navy-foreground transition-colors hover:bg-brand-orange"
      >
        Ко всем новостям
      </Link>
    </main>
  );
}

function NewsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
      <h1 className="ui-h1">Не удалось загрузить новость</h1>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-5 py-2.5 text-sm font-semibold text-brand-navy-foreground transition-colors hover:bg-brand-orange"
      >
        Попробовать ещё раз
      </button>
    </main>
  );
}
