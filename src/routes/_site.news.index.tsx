import { useMemo } from "react";
import { createFileRoute, useNavigate, stripSearchParams } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Breadcrumbs, type Crumb } from "@/components/site/Breadcrumbs";
import { CategoryFilterChips } from "@/components/site/CategoryFilterChips";
import { listNews } from "@/lib/news-server-fn";
import { NewsListCard } from "@/components/site/NewsListCard";
import { sortNewsByDateDesc } from "@/lib/news-date";
import {
  DEFAULT_SECTION_CATEGORY,
  SECTION_CATEGORIES,
  SECTION_CATEGORY_LABELS,
  type SectionCategory,
} from "@/lib/section-category";
import type { NewsSection } from "@/lib/types/news";

const DEFAULT_FILTER: SectionCategory = DEFAULT_SECTION_CATEGORY;

const CRUMBS: Crumb[] = [{ label: "Главная", href: "/" }, { label: "Новости" }];

const searchSchema = z.object({
  category: fallback(z.enum(SECTION_CATEGORIES), DEFAULT_FILTER).default(DEFAULT_FILTER),
});

export const Route = createFileRoute("/_site/news/")({
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
  const active: SectionCategory = category;

  const items = useMemo(() => {
    const sorted = sortNewsByDateDesc(news);
    if (active === "all") return sorted;
    // Сравниваем машинный раздел, а не русскую подпись category.
    // «Общее» — новости без раздела (section === null).
    const wanted: NewsSection | null = active === "general" ? null : active;
    return sorted.filter((n) => (n.section ?? null) === wanted);
  }, [news, active]);

  const select = (value: SectionCategory) => {
    navigate({ search: { category: value }, resetScroll: false });
  };

  return (
    <main className="mx-auto max-w-7xl px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10">
      <Breadcrumbs items={CRUMBS} />

      <header className="mb-6 md:mb-8">
        <h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl lg:text-6xl">
          Новости
        </h1>
      </header>

      <CategoryFilterChips active={active} onSelect={select} labels={SECTION_CATEGORY_LABELS} />

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
  );
}
