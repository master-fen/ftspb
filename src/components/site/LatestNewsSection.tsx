import { Link } from "@tanstack/react-router";
import { latestNews } from "@/data/mock";
import { NewsListCard } from "./NewsListCard";
import { NewsCoverPlaceholder } from "./NewsCoverPlaceholder";
import { SectionHeading } from "./SectionHeading";
import { newsMetaLine } from "@/lib/news-meta";

const allNewsLinkClass =
  "font-ui text-[15px] font-bold leading-[19.25px] text-brand-blue transition-colors hover:text-brand-orange inline-block xl:text-[16px]";

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
                  {newsMetaLine(item.category, item.date)}
                </div>
              </div>
              <div className="aspect-square h-[84px] w-[84px] shrink-0 overflow-hidden rounded-lg">
                {item.cover ? (
                  <NewsImage src={item.cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <NewsCoverPlaceholder withBackground={false} />
                )}
              </div>

            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4 md:hidden">
        <Link to="/news" className={allNewsLinkClass}>
          Все новости…
        </Link>
      </div>

      {/* Desktop/tablet: 3-col grid of news cards */}
      <div className="mt-6 hidden grid-cols-2 gap-5 md:grid lg:grid-cols-3 lg:gap-6">
        {latestNews.map((item) => (
          <NewsListCard key={item.id} item={item} />
        ))}
      </div>

      <div className="mt-8 hidden md:flex">
        <Link to="/news" className={allNewsLinkClass}>
          Все новости…
        </Link>
      </div>
    </section>
  );
}
