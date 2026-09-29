import { Link } from "@tanstack/react-router";
import type { NewsCardItem } from "@/lib/types/news";
import type { NewsOrigin } from "@/lib/news-origin";
import { NewsCardCover } from "./NewsCardCover";
import { newsMetaLine } from "@/lib/news-meta";

/**
 * `from` — откуда ведёт ссылка (лента раздела): попадает в `?from=` и задаёт
 * хлебные крошки на странице новости. Без пропа ссылка прежняя, без параметра.
 * `fromList` — карточка стоит в ленте (`/news`, `/federation/news`): запись
 * новости получает маркер, и «Ко всем новостям» возвращает в ту же точку ленты
 * (src/lib/news-return.ts). На главной проп не передаётся.
 */
export function NewsListCard({
  item,
  from,
  fromList,
}: {
  item: NewsCardItem;
  from?: NewsOrigin;
  fromList?: boolean;
}) {
  return (
    <Link
      to="/news/$newsId"
      params={{ newsId: item.id }}
      search={from ? { from } : undefined}
      state={fromList ? { fromNewsList: true } : undefined}
      className="group flex h-full flex-col overflow-hidden ui-card ring-card-border bg-card-surface text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:bg-card-hover"
    >
      <div className="aspect-[4/3] w-full overflow-hidden">
        <NewsCardCover item={item} variant="list" />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5 md:p-6">
        <div className="ui-caption">{newsMetaLine(item.category, item.date)}</div>
        {/* Страховка по высоте: заголовок и анонс не длиннее трёх строк, лишнее — многоточием. */}
        <h3 className="line-clamp-3 ui-card-title">{item.title}</h3>
        {item.excerpt ? (
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {item.excerpt}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
