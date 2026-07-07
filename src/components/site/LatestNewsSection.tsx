import { latestNews } from "@/data/mock";
import { NewsCard } from "./NewsCard";
import { SectionHeading } from "./SectionHeading";

export function LatestNewsSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-14 pb-20 lg:px-10">
      <SectionHeading eyebrow="Новости" title="Последнее" />

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {latestNews.map((item) => (
          <div key={item.id} className="aspect-[4/3]">
            <NewsCard item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}
