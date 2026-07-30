import { useMemo } from "react";
import { createFileRoute, Link, useNavigate, stripSearchParams } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ChevronRight, Check } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { allNews } from "@/data/mock";
import { NewsListCard } from "@/components/site/NewsListCard";
import type { NewsCategory } from "@/lib/types/news";

type FilterValue = "general" | "federation" | "referees";

const searchSchema = z.object({
  category: fallback(z.string().array(), []).default([]),
});

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "general", label: "Общее" },
  { value: "federation", label: "Федерация" },
  { value: "referees", label: "Коллегия судей" },
];

const VALUE_TO_CATEGORY: Record<FilterValue, NewsCategory> = {
  general: "Общее",
  federation: "Федерация",
  referees: "Коллегия судей",
};

function normalize(raw: string[]): FilterValue[] {
  const known = FILTERS.map((f) => f.value) as string[];
  return Array.from(new Set(raw.filter((v) => known.includes(v)))) as FilterValue[];
}

export const Route = createFileRoute("/news/")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams({ category: [] })],
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
  const navigate = useNavigate({ from: "/news/" });
  const active = normalize(category);

  const items = useMemo(() => {
    const sorted = [...allNews].sort(
      (a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime(),
    );
    if (active.length === 0) return sorted;
    const cats = active.map((v) => VALUE_TO_CATEGORY[v]);
    return sorted.filter((n) => cats.includes(n.category));
  }, [active]);

  const toggle = (value: FilterValue) => {
    const next = active.includes(value) ? active.filter((v) => v !== value) : [...active, value];
    navigate({ search: { category: next }, resetScroll: false });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10">
        <nav
          aria-label="Хлебные крошки"
          className="mb-4 flex items-center gap-2 text-sm text-muted-foreground md:mb-5"
        >
          <Link to="/" className="transition-colors hover:text-brand-navy">
            Главная
          </Link>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span className="text-foreground" aria-current="page">
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
          <button
            type="button"
            aria-pressed={active.length === 0}
            onClick={() => navigate({ search: { category: [] }, resetScroll: false })}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              active.length === 0
                ? "bg-brand-navy text-brand-navy-foreground"
                : "bg-muted text-brand-navy hover:bg-brand-orange/10 hover:text-brand-orange"
            }`}
          >
            Все
          </button>

          {FILTERS.map((f) => {
            const isActive = active.includes(f.value);
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => toggle(f.value)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-brand-navy text-brand-navy-foreground"
                    : "bg-muted text-brand-navy hover:bg-brand-orange/10 hover:text-brand-orange"
                }`}
              >
                {isActive && <Check className="h-4 w-4" aria-hidden="true" />}
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
