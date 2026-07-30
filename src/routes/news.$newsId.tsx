import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronRight, Download, FileText } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { allNews } from "@/data/mock";
import type { NewsItem } from "@/lib/types/news";

export const Route = createFileRoute("/news/$newsId")({
  loader: ({ params }) => {
    const item = allNews.find((n) => n.id === params.newsId);
    if (!item) throw notFound();
    const related = allNews.filter((n) => n.id !== item.id).slice(0, 3);
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
    return {
      meta: [
        { title: `${item.title} — Федерация тенниса Санкт-Петербурга` },
        { name: "description", content: desc },
        { property: "og:title", content: item.title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: NewsNotFound,
  errorComponent: NewsError,
  component: NewsDetailPage,
});

function NewsDetailPage() {
  const { item, related } = Route.useLoaderData();

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

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-14 md:px-6 md:pt-8 md:pb-20 lg:px-10">
        {/* Breadcrumbs */}
        <nav
          aria-label="Хлебные крошки"
          className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link to="/" className="transition-colors hover:text-brand-orange">
            Главная
          </Link>
          <ChevronRight className="h-4 w-4 opacity-60" aria-hidden />
          <Link to="/news" className="transition-colors hover:text-brand-orange">
            Новости
          </Link>
          <ChevronRight className="h-4 w-4 opacity-60" aria-hidden />
          <span className="text-foreground/80 line-clamp-1">{item.title}</span>
        </nav>

        <header className="mt-5 md:mt-7">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-brand-orange uppercase">
            {item.category} — {item.date}
          </div>
          <h1 className="mt-3 text-3xl leading-tight font-black tracking-tight text-foreground md:text-4xl lg:text-5xl">
            {item.title}
          </h1>
          {showLead ? (
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
              {item.excerpt}
            </p>
          ) : null}
        </header>

        <div className="mt-8 grid grid-cols-1 gap-8 md:mt-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
          {/* Main column */}
          <div className="min-w-0">
            {item.cover ? (
              <figure className="overflow-hidden rounded-2xl bg-muted shadow-sm ring-1 ring-black/5">
                <img
                  src={item.cover}
                  alt={item.title}
                  className="aspect-[16/10] w-full object-cover"
                />
              </figure>
            ) : null}

            {item.body ? (
              <div
                className="news-prose mt-8 text-[15px] text-foreground md:mt-10 md:text-base"
                dangerouslySetInnerHTML={{ __html: item.body }}
              />
            ) : null}

            {item.attachments && item.attachments.length > 0 ? (
              <section className="mt-10 md:mt-12">
                <div className="h-px w-full bg-brand-navy/25" />
                <h2 className="mt-6 text-sm font-bold tracking-wide text-foreground uppercase">
                  Прикреплённые файлы
                </h2>
                <ul className="mt-4 space-y-2">
                  {item.attachments.map(
                    (att: NonNullable<NewsItem["attachments"]>[number], i: number) => (
                      <li key={i}>
                        <a
                          href="#"
                          className="group flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3 ring-1 ring-black/5 transition-colors hover:bg-brand-orange/5"
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
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-navy transition-colors hover:text-brand-orange"
                >
                  <span aria-hidden>←</span> Ко всем новостям
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function RelatedItem({ item }: { item: NewsItem }) {
  return (
    <li>
      <Link to="/news/$newsId" params={{ newsId: item.id }} className="group block">
        <div className="text-[10px] font-semibold tracking-[0.14em] text-brand-orange uppercase">
          {item.category} — {item.date}
        </div>
        <div className="mt-1 text-sm leading-snug font-semibold text-foreground transition-colors group-hover:text-brand-navy">
          {item.title}
        </div>
      </Link>
    </li>
  );
}

function NewsNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
        <p className="text-sm font-semibold tracking-wide text-brand-orange uppercase">404</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Новость не найдена</h1>
        <p className="mt-4 text-muted-foreground">Возможно, материал был перемещён или удалён.</p>
        <Link
          to="/news"
          className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-5 py-2.5 text-sm font-semibold text-brand-navy-foreground transition-colors hover:bg-brand-orange"
        >
          Ко всем новостям
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

function NewsError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">
          Не удалось загрузить новость
        </h1>
        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-5 py-2.5 text-sm font-semibold text-brand-navy-foreground transition-colors hover:bg-brand-orange"
        >
          Попробовать ещё раз
        </button>
      </main>
      <SiteFooter />
    </div>
  );
}
