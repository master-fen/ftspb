import { useMemo } from "react";
import { createFileRoute, Link, useNavigate, stripSearchParams } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { listNews } from "@/lib/news-server-fn";
import { NewsListCard } from "@/components/site/NewsListCard";
import type { NewsCategory } from "@/lib/types/news";

type FilterValue = "all" | "general" | "federation" | "referees";

const DEFAULT_FILTER: FilterValue = "general";

const searchSchema = z.object({
  category: fallback(z.enum(["all", "general", "federation", "referees"]), DEFAULT_FILTER).default(
    DEFAULT_FILTER,
  ),
});

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "general", label: "Общее" },
  { value: "federation", label: "Федерация" },
  { value: "referees", label: "Коллегия судей" },
];

const VALUE_TO_CATEGORY: Record<Exclude<FilterValue, "all">, NewsCategory> = {
  general: "Общее",
  federation: "Федерация",
  referees: "Коллегия судей",
};

export const Route = createFileRoute("/news/")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams({ category: DEFAULT_FILTER })],
  },
  loader: () => listNews(),
  head: () => ({
    meta: [
      { title: "Новости — Федерация тенниса Санкт-Петербурга" },
      {
        name: "description",
        content:
          "Все новости Федерации тенниса Санкт-Петербурга: общая лента и официальные новости Федерации.",
      },
      {
        property: "og:title",
        content: "Новости — Федерация тенниса Санкт-Петербурга",
      },
      {
        property: "og:description",
        content: "Общая лента новостей Федерации тенниса Санкт-Петербурга с фильтром по разделам.",
      },
    ],
  }),
  component: NewsPage,
});

function NewsPage() {
  const news = Route.useLoaderData();
  const { category } = Route.useSearch();
  const navigate = useNavigate({ from: "/news/" });
  const active: FilterValue = category;

  const items = useMemo(() => {
    const sorted = [...news].sort(
      (a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime(),
    );
    if (active === "all") return sorted;
    const cat = VALUE_TO_CATEGORY[active];
    return sorted.filter((n) => n.category === cat);
  }, [news, active]);

  const select = (value: FilterValue) => {
    navigate({ search: { category: value }, resetScroll: false });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10">
        <nav
          aria-label="Хлебные крошки"
          className="mb-4 flex h-8 items-center gap-3 text-sm leading-8 font-medium text-muted-foreground md:mb-5"
        >
          <Link to="/" className="transition-colors hover:text-foreground">
            Главная
          </Link>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-border" aria-hidden="true" />
          <span aria-current="page">
            Новости
          </span>
        </nav>

        <header className="mb-6 md:mb-8">
          <h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Новости
          </h1>
        </header>

        <div
          role="group"
          aria-label="Фильтр по разделам"
          className="mb-8 flex flex-wrap gap-2 md:mb-10"
        >
          {FILTERS.map((f) => {
            const isActive = active === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => select(f.value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-brand-navy text-brand-navy-foreground"
                    : "bg-muted text-brand-navy hover:bg-brand-orange/10 hover:text-brand-orange"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl bg-muted p-8 text-center text-muted-foreground">
            В этом разделе пока нет новостей.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {items.map((item) => (
              <NewsListCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function parseDate(s: string): Date {
  // dd.mm.yy
  const [d, m, y] = s.split(".").map((x) => parseInt(x, 10));
  return new Date(2000 + y, m - 1, d);
}
