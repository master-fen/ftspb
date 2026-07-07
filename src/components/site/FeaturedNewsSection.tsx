import { useState } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { featuredNews } from "@/data/mock";
import { NewsCard } from "./NewsCard";
import { SectionHeading } from "./SectionHeading";

export function FeaturedNewsSection() {
  const [hero, second, third] = featuredNews;
  const [index, setIndex] = useState(0);
  const items = featuredNews;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 md:px-6 md:pt-10 lg:px-10">
      <SectionHeading eyebrow="Новости" title="Главное" />

      {/* Mobile: single-card carousel */}
      <div className="mt-5 md:hidden">
        <div className="relative">
          <div className="aspect-[4/3] overflow-hidden rounded-xl">
            <NewsCard item={items[index]} size="hero" priority={index === 0} />
          </div>
          <button
            type="button"
            aria-label="Предыдущая"
            onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
            className="absolute top-1/2 left-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-brand-navy shadow-md backdrop-blur-sm"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Следующая"
            onClick={() => setIndex((i) => (i + 1) % items.length)}
            className="absolute top-1/2 right-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-brand-navy shadow-md backdrop-blur-sm"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 flex justify-center gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Слайд ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-brand-orange" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Desktop/tablet: 2/3 hero + stacked pair */}
      <div className="mt-6 hidden gap-5 md:grid md:grid-cols-3 md:grid-rows-2 md:[grid-auto-rows:1fr]">
        <div className="md:col-span-2 md:row-span-2 md:aspect-[4/3]">
          <NewsCard item={hero} size="hero" priority />
        </div>
        <div className="md:col-span-1 md:row-span-1">
          <NewsCard item={second} />
        </div>
        <div className="md:col-span-1 md:row-span-1">
          <NewsCard item={third} />
        </div>
      </div>
    </section>
  );
}
