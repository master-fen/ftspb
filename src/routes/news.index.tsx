import { useMemo } from "react";
import { createFileRoute, Link, stripSearchParams } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { allNews } from "@/data/mock";
import { NewsListCard } from "@/components/site/NewsListCard";
import type { NewsCategory } from "@/lib/types/news";

type FilterValue = "all" | "general" | "federation";

const searchSchema = z.object({
  category: fallback(z.string(), "all").default("all"),
});

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "general", label: "Общее" },
  { value: "federation", label: "Федерация" },
];

const VALUE_TO_CATEGORY: Record<Exclude<FilterValue, "all">, NewsCategory> = {
  general: "Общее",
  federation: "Федерация",
};

function normalize(raw: string): FilterValue {
  return raw === "general" || raw === "federation" ? raw : "all";
}

export const Route = createFileRoute("/news/")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams({ category: "all" })],
  },
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
  const { category } = Route.useSearch();
  const active = normalize(category);

  const items = useMemo(() => {
    const sorted = [...allNews].sort(
      (a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime(),
    );
    if (active === "all") return sorted;
    const cat = VALUE_TO_CATEGORY[active];
    return sorted.filter((n) => n.category === cat);
  }, [active]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10">
        {/* Breadcrumbs */}
        <nav
          aria-label="Хлебные крошки"
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link to="/" className="transition-colors hover:text-brand-orange">
            Главная
          </Link>
          <ChevronRight className="h-4 w-4 opacity-60" aria-hidden />
          <span className="text-foreground/80">Новости</span>
        </nav>

        <header className="mt-4 mb-6 md:mt-6 md:mb-8">
          <h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Новости
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            Общая лента всех новостей Федерации. Фильтруйте по разделу, чтобы увидеть только нужное.
          </p>
        </header>

        <div className="mb-8 flex flex-wrap gap-2 md:mb-10">
          {FILTERS.map((f) => {
            const isActive = f.value === active;
            return (
              <Link
                key={f.value}
                to="/news"
                search={{ category: f.value }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-brand-navy text-brand-navy-foreground"
                    : "bg-muted text-brand-navy hover:bg-brand-orange/10 hover:text-brand-orange"
                }`}
              >
                {f.label}
              </Link>
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
