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
      className="group flex h-full flex-col overflow-hidden ui-card ring-black/5 bg-news-card text-news-card-foreground transition-all duration-300 hover:-translate-y-0.5 hover:bg-news-card-hover"
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
        <div className="ui-caption">{newsMetaLine(item.category, item.date)}</div>
        <h3 className="ui-card-title">{item.title}</h3>
        {item.excerpt ? (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.excerpt}</p>
        ) : null}
      </div>
    </Link>
  );
}
