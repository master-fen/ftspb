import { useEffect, useRef, useState } from "react";
import { featuredNews } from "@/data/mock";
import { NewsCard } from "./NewsCard";
import { SectionHeading } from "./SectionHeading";

export function FeaturedNewsSection() {
  const [hero, second, third] = featuredNews;
  const [index, setIndex] = useState(0);
  const items = featuredNews;
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  const scrollToIndex = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
  };

  // Автопрокрутка — подсказывает, что карточки можно свайпать
  useEffect(() => {
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      const track = trackRef.current;
      if (!track || track.clientWidth === 0) return;
      const next = (Math.round(track.scrollLeft / track.clientWidth) + 1) % items.length;
      track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
    }, 4500);
    return () => window.clearInterval(id);
  }, [items.length]);

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  };

  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 md:px-6 md:pt-10 lg:px-10">
      <SectionHeading eyebrow="Новости" title="Главное" />

      {/* Mobile: swipeable auto-playing carousel */}
      <div className="mt-5 md:hidden">
        <div
          ref={trackRef}
          onScroll={handleScroll}
          onPointerDown={() => (pausedRef.current = true)}
          onPointerUp={() => (pausedRef.current = false)}
          onPointerCancel={() => (pausedRef.current = false)}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, i) => (
            <div key={item.id} className="w-full shrink-0 snap-center px-0.5">
              <div className="aspect-[4/3] overflow-hidden rounded-xl">
                <NewsCard item={item} size="hero" priority={i === 0} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-center gap-1.5">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Слайд ${i + 1}`}
              onClick={() => scrollToIndex(i)}
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
