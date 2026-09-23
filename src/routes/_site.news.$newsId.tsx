import { useCallback, useEffect, useRef } from "react";
import {
  createFileRoute,
  Link,
  notFound,
  stripSearchParams,
  useCanGoBack,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Download, FileText } from "lucide-react";
import { Breadcrumbs, type Crumb } from "@/components/site/Breadcrumbs";
import { NewsGallery } from "@/components/site/NewsGallery";
import { NewsVideo } from "@/components/site/NewsVideo";
import { NewsBody } from "@/components/site/NewsBody";
import { getNewsArticle } from "@/lib/news-server-fn";
import type { NewsCardItem, NewsItem } from "@/lib/types/news";
import { newsMetaLine } from "@/lib/news-meta";
import { shouldShowLead } from "@/lib/news-lead";
import { galleryImages } from "@/lib/gallery-layout";
import { formatPhotoHash, parsePhotoHash } from "@/lib/photo-hash";
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

/**
 * Открытый кадр лайтбокса — из hash адреса `#photo=N`: один источник истины,
 * «назад» браузера закрывает лайтбокс, ссылка на кадр переживает F5.
 *
 * Открытие — push с маркером `photoLightbox` в state записи; шаг — replace с
 * сохранением state (`state: true`); закрытие — `history.back()`, если запись
 * наша и назад есть куда, иначе replace на адрес без hash (прямой заход с
 * hash, скопированная ссылка). `search: true` обязателен: без него `?from=`
 * обнулился бы. `resetScroll: false` и `hashScrollIntoView: false` — страница
 * под оверлеем не двигается, элемента с id `photo=N` нет.
 *
 * Неверный hash (`photo=0`, `photo=99`, `razdel-3`) — `null`: лайтбокс закрыт,
 * адрес не трогается.
 */
function usePhotoLightbox(total: number) {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const ours = useRouterState({ select: (s) => s.location.state.photoLightbox === true });
  const canGoBack = useCanGoBack();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const openIndex = parsePhotoHash(hash, total);

  // `history.back()` асинхронен: до popstate запись ещё наша, и второй Esc или
  // клик по ✕ сделал бы второй back() — с сайта. Пока закрытие идёт, повтор —
  // no-op; флаг снимается, когда индекс стал null.
  const closingRef = useRef(false);
  useEffect(() => {
    if (openIndex === null) closingRef.current = false;
  }, [openIndex]);

  const open = useCallback(
    (index: number) =>
      void navigate({
        to: Route.fullPath,
        params: true,
        search: true,
        hash: formatPhotoHash(index),
        state: { photoLightbox: true },
        resetScroll: false,
        hashScrollIntoView: false,
      }),
    [navigate],
  );
  const step = useCallback(
    (index: number) =>
      void navigate({
        to: Route.fullPath,
        params: true,
        search: true,
        hash: formatPhotoHash(index),
        state: true,
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      }),
    [navigate],
  );
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (ours && canGoBack) {
      router.history.back();
      return;
    }
    void navigate({
      to: Route.fullPath,
      params: true,
      search: true,
      state: {},
      replace: true,
      resetScroll: false,
      hashScrollIntoView: false,
    });
  }, [ours, canGoBack, router, navigate]);

  return { openIndex, open, step, close };
}

function NewsDetailPage() {
  const { item, related } = Route.useLoaderData();
  const { from } = Route.useSearch();
  const crumbs = from === "federation" ? CRUMBS_FEDERATION : CRUMBS_DEFAULT;

  // Не показываем анонс, если он дублирует начало текста новости (src/lib/news-lead.ts).
  const showLead = shouldShowLead(item.excerpt, item.body);
  // Флаг news.hide_cover_on_page прячет обложку только здесь; карточки и og:image (head) читают item.cover.
  const pageCover = item.hideCoverOnPage ? undefined : item.cover;
  const gallery = item.gallery ?? [];
  // Нумерация #photo=N — по списку фото страницы (без обложки при hideCoverOnPage), как счётчик.
  const lightbox = usePhotoLightbox(galleryImages(pageCover, gallery).length);

  return (
    <main className="mx-auto max-w-7xl lg:box-content px-4 pt-6 pb-14 md:px-6 md:pt-8 md:pb-20 lg:px-10">
      <Breadcrumbs items={[...crumbs, { label: item.title }]} />

      <header className="mt-5 md:mt-7 lg:grid lg:grid-cols-12 lg:gap-x-5">
        <div className="ui-overline lg:col-span-8">{newsMetaLine(item.category, item.date)}</div>
        <h1 className="mt-3 ui-h1 lg:col-span-8">{item.title}</h1>
        {showLead ? (
          <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground md:text-lg lg:col-span-8">
            {item.excerpt}
          </p>
        ) : null}
      </header>

      <div className="mt-7 grid grid-cols-1 gap-10 md:mt-8 lg:grid-cols-12 lg:gap-5">
        {/* Main column */}
        <div className="min-w-0 space-y-8 lg:col-span-8">
          {item.videoUrl ? <NewsVideo src={item.videoUrl} title={item.title} /> : null}

          {pageCover || gallery.length ? (
            <NewsGallery
              cover={pageCover}
              gallery={gallery}
              title={item.title}
              openIndex={lightbox.openIndex}
              onOpen={lightbox.open}
              onStep={lightbox.step}
              onClose={lightbox.close}
            />
          ) : null}

          {item.body ? <NewsBody body={item.body} /> : null}

          {item.attachments && item.attachments.length > 0 ? (
            <section>
              <div className="h-px w-full bg-border" />
              <h2 className="mt-6 ui-h2">Прикреплённые файлы</h2>
              <ul className="mt-4 space-y-2">
                {item.attachments.map(
                  (att: NonNullable<NewsItem["attachments"]>[number], i: number) => (
                    <li key={i}>
                      <a
                        href={att.url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center gap-3 rounded-xl bg-muted px-4 py-3 ui-link-row"
                      >
                        <FileText className="h-5 w-5 text-brand-navy/70" aria-hidden />
                        <span className="rounded-md bg-brand-navy px-2 py-0.5 text-[10px] font-bold tracking-wider text-brand-navy-foreground uppercase">
                          {att.kind}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {att.title}
                        </span>
                        {att.size ? (
                          <span className="hidden ui-caption sm:inline">{att.size}</span>
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
        <aside className="lg:sticky lg:top-8 lg:self-start lg:col-span-4">
          <div className="ui-card ring-card-border bg-muted p-6">
            <h2 className="text-sm font-bold tracking-wide text-foreground/80">Читайте также</h2>
            <ul className="mt-5 space-y-5">
              {related.map((r: NewsCardItem) => (
                <RelatedItem key={r.id} item={r} />
              ))}
            </ul>
            <div className="mt-6 border-t border-border pt-4">
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

function RelatedItem({ item }: { item: NewsCardItem }) {
  return (
    <li>
      <Link
        to="/news/$newsId"
        params={{ newsId: item.id }}
        className="block text-foreground ui-link"
      >
        <div className="ui-caption">{newsMetaLine(item.category, item.date)}</div>
        <div className="mt-1 text-sm leading-snug font-semibold">{item.title}</div>
      </Link>
    </li>
  );
}

function NewsNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
      <p className="ui-overline">404</p>
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
