import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { NewsCard } from "@/components/site/NewsCard";
import { allNews, type NewsCategory } from "@/data/mock";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "Новости — Федерация тенниса Санкт-Петербурга" },
      {
        name: "description",
        content:
          "Все новости Федерации тенниса Санкт-Петербурга: турниры, сборные, судейская коллегия, клубы города.",
      },
      {
        property: "og:title",
        content: "Новости — Федерация тенниса Санкт-Петербурга",
      },
      {
        property: "og:description",
        content:
          "Общая лента новостей Федерации тенниса Санкт-Петербурга с фильтром по разделам.",
      },
    ],
  }),
  component: NewsPage,
});

type Filter = "Все" | "Главные" | NewsCategory;

const FILTERS: Filter[] = [
  "Все",
  "Главные",
  "Федерация",
  "Судьи",
  "Турниры",
  "Сборная",
  "Клубы",
];

function NewsPage() {
  const [filter, setFilter] = useState<Filter>("Все");

  const items = useMemo(() => {
    const sorted = [...allNews].sort((a, b) =>
      parseDate(b.date).getTime() - parseDate(a.date).getTime(),
    );
    if (filter === "Все") return sorted;
    if (filter === "Главные") return sorted.filter((n) => n.featured);
    return sorted.filter((n) => n.category === filter);
  }, [filter]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14 lg:px-10">
        <header className="mb-8 md:mb-10">
          <h1 className="text-3xl font-black tracking-tight text-foreground md:text-5xl">
            Новости
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            Общая лента всех новостей Федерации. Фильтруйте по разделу, чтобы
            увидеть только нужное.
          </p>
        </header>

        <div className="mb-8 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-brand-blue text-primary-foreground"
                    : "bg-muted text-brand-blue hover:bg-brand-orange/10 hover:text-brand-orange"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl bg-muted p-8 text-center text-muted-foreground">
            В этом разделе пока нет новостей.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="aspect-[4/3]">
                <NewsCard item={item} />
              </div>
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
