import { Link } from "@tanstack/react-router";
import type { NewsCardItem } from "@/lib/types/news";
import { NewsCardCover } from "./NewsCardCover";
import { newsMetaLine } from "@/lib/news-meta";

type NewsCardProps = {
  item: NewsCardItem;
  size?: "hero" | "default";
  priority?: boolean;
};

export function NewsCard({ item, size = "default", priority }: NewsCardProps) {
  const isHero = size === "hero";

  return (
    <Link
      to="/news/$newsId"
      params={{ newsId: item.id }}
      className="group relative block h-full w-full overflow-hidden ui-card ring-card-border bg-card-surface transition-transform duration-300 hover:-translate-y-0.5"
    >
      <div className="relative h-full w-full">
        <NewsCardCover item={item} variant="hero" priority={priority} />

        <div className="absolute inset-0 bg-gradient-to-t from-scrim via-scrim-mid to-transparent" />

        <div
          className={`absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-5 text-inverse-foreground ${
            isHero ? "md:p-7" : ""
          }`}
        >
          <div className="text-[11px] font-medium tracking-wide text-inverse-foreground-muted uppercase">
            {newsMetaLine(item.category, item.date)}
          </div>
          <h3
            className={`font-bold leading-snug ${
              isHero ? "text-xl md:text-2xl lg:text-[26px]" : "text-base md:text-lg"
            }`}
          >
            {item.title}
          </h3>
          {isHero && item.excerpt ? (
            <p className="mt-1 max-w-xl text-sm text-inverse-foreground md:text-[15px]">
              {item.excerpt}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
