import { Link } from "@tanstack/react-router";
import type { NewsItem } from "@/data/mock";

type NewsCardProps = {
  item: NewsItem;
  size?: "hero" | "default";
  priority?: boolean;
};

export function NewsCard({ item, size = "default", priority }: NewsCardProps) {
  const isHero = size === "hero";

  return (
    <Link
      to="/news/$newsId"
      params={{ newsId: item.id }}
      className="group relative block h-full w-full overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-black/5 transition-transform duration-300 hover:-translate-y-0.5"
    >
      <div className="relative h-full w-full">
        <img
          src={item.cover}
          alt={item.title}
          loading={priority ? "eager" : "lazy"}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

        <div
          className={`absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-5 text-white ${
            isHero ? "md:p-7" : ""
          }`}
        >
          <div className="text-[11px] font-medium tracking-wide text-white/75 uppercase">
            {item.category} — {item.date}
          </div>
          <h3
            className={`font-bold leading-snug ${
              isHero ? "text-xl md:text-2xl lg:text-[26px]" : "text-base md:text-lg"
            }`}
          >
            {item.title}
          </h3>
          {isHero && item.excerpt ? (
            <p className="mt-1 max-w-xl text-sm text-white/85 md:text-[15px]">{item.excerpt}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
