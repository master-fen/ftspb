import { Link } from "@tanstack/react-router";
import { latestNews } from "@/data/mock";
import { Button } from "@/components/ui/button";
import { NewsListCard } from "./NewsListCard";
import { SectionHeading } from "./SectionHeading";

export function LatestNewsSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-10 pb-14 md:px-6 md:pt-14 md:pb-20 lg:px-10">
      <SectionHeading eyebrow="Новости" title="Последнее" />

      {/* Mobile: compact list */}
      <ul className="mt-5 flex flex-col gap-3 md:hidden">
        {latestNews.map((item) => (
          <li key={item.id}>
            <Link
              to="/news/$newsId"
              params={{ newsId: item.id }}
              className="grid grid-cols-[minmax(0,1fr)_84px] items-center gap-3 rounded-xl bg-news-card p-3 transition-colors hover:bg-news-card-hover"
            >
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-[15px] font-semibold text-news-card-foreground">
                  {item.title}
                </h3>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {item.category} — {item.date}
                </div>
              </div>
              <div className="aspect-square h-[84px] w-[84px] shrink-0 overflow-hidden rounded-lg">
                <img
                  src={item.cover}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4 md:hidden">
        <Link
          to="/news"
          className="inline-flex text-base font-semibold text-brand-blue transition-colors hover:text-brand-orange"
        >
          Все новости…
        </Link>
      </div>

      {/* Desktop/tablet: 3-col grid of news cards */}
      <div className="mt-6 hidden grid-cols-2 gap-5 md:grid lg:grid-cols-3 lg:gap-6">
        {latestNews.map((item) => (
          <NewsListCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
