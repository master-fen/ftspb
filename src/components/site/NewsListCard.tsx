import { Link } from "@tanstack/react-router";
import type { NewsItem } from "@/lib/types/news";
import type { NewsOrigin } from "@/lib/news-origin";
import { NewsCoverPlaceholder } from "./NewsCoverPlaceholder";
import { NewsImage } from "./NewsImage";
import { newsMetaLine } from "@/lib/news-meta";

/**
 * `from` — откуда ведёт ссылка (лента раздела): попадает в `?from=` и задаёт
 * хлебные крошки на странице новости. Без пропа ссылка прежняя, без параметра.
 */
export function NewsListCard({ item, from }: { item: NewsItem; from?: NewsOrigin }) {
  return (
    <Link
      to="/news/$newsId"
      params={{ newsId: item.id }}
      search={from ? { from } : undefined}
      className="group flex h-full flex-col overflow-hidden rounded-xl bg-news-card text-news-card-foreground shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-news-card-hover"
    >
      <div className="aspect-[4/3] w-full overflow-hidden">
        {item.cover ? (
          <NewsImage
            src={item.cover}
            alt={item.title}
            className="h-full w-full object-cover object-[50%_25%] transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <NewsCoverPlaceholder withBackground={false} />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5 md:p-6">
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {newsMetaLine(item.category, item.date)}
        </div>
        <h3 className="text-lg leading-snug font-bold text-news-card-foreground md:text-[19px]">
          {item.title}
        </h3>
        {item.excerpt ? (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.excerpt}</p>
        ) : null}
      </div>
    </Link>
  );
}
