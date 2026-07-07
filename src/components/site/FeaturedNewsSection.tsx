import { featuredNews } from "@/data/mock";
import { NewsCard } from "./NewsCard";
import { SectionHeading } from "./SectionHeading";

export function FeaturedNewsSection() {
  const [hero, second, third] = featuredNews;

  return (
    <section className="mx-auto max-w-7xl px-6 pt-10 lg:px-10">
      <SectionHeading eyebrow="Новости" title="Главное" />

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3 md:grid-rows-2 md:[grid-auto-rows:1fr]">
        <div className="md:col-span-2 md:row-span-2 md:aspect-[4/3]">
          <NewsCard item={hero} size="hero" priority />
        </div>
        <div className="md:col-span-1 md:row-span-1 aspect-[16/9] md:aspect-auto">
          <NewsCard item={second} />
        </div>
        <div className="md:col-span-1 md:row-span-1 aspect-[16/9] md:aspect-auto">
          <NewsCard item={third} />
        </div>
      </div>
    </section>
  );
}
