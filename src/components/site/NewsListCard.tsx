import { Link } from "@tanstack/react-router";
import type { NewsItem } from "@/lib/types/news";

export function NewsListCard({ item }: { item: NewsItem }) {
  return (
    <Link
      to="/news/$newsId"
      params={{ newsId: item.id }}
      className="group flex h-full flex-col overflow-hidden rounded-xl bg-brand-navy text-brand-navy-foreground shadow-sm ring-1 ring-black/5 transition-transform duration-300 hover:-translate-y-0.5"
    >
      <div className="aspect-[4/3] w-full overflow-hidden">
        <img
          src={item.cover}
          alt={item.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5 md:p-6">
        <div className="text-[11px] font-semibold tracking-wide text-white/70 uppercase">
          {item.category} — {item.date}
        </div>
        <h3 className="text-lg leading-snug font-bold text-white md:text-[19px]">{item.title}</h3>
        {item.excerpt ? (
          <p className="mt-1 text-sm leading-relaxed text-white/80">{item.excerpt}</p>
        ) : null}
      </div>
    </Link>
  );
}
