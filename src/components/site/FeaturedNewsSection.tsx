import { useEffect, useRef, useState } from "react";
import { featuredNews } from "@/data/mock";
import type { NewsItem } from "@/lib/types/news";
import { NewsCard } from "./NewsCard";
import { SectionHeading } from "./SectionHeading";

type FeaturedNewsSectionProps = {
  items?: NewsItem[];
};

export function FeaturedNewsSection({ items = featuredNews }: FeaturedNewsSectionProps) {
  const [hero, second, third] = items;
  const [index, setIndex] = useState(0);
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
      if (items.length === 0) return;
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

      {/* Desktop/tablet: 2/3 hero + stacked pair

          Высоту строк задают только малые карточки: у них пропорция 4:3, а
          герой растягивается на две строки плюс зазор. Раньше источников
          высоты было два — свои 4:3 у героя и натуральная пропорция обложки
          правой верхней карточки. У карточки высота не задана, а внутри
          NewsCard всё построено на `height: 100%`; при контейнере
          неопределённой высоты проценты сводятся к `auto`, и картинка
          подставляет свой натуральный размер. Побеждал больший вклад, герой
          оставался выше низа правой колонки: при обложке 421×331 строки
          выходили 383.33/1.272 = 301.4, сетка 622.8, герой 590 — щель 33 px.

          `md:contain-size` у героя обязателен. Снять пропорцию мало: тогда
          натуральный размер уже его собственной обложки начинает задавать
          строки тем же путём (замер: строки 299.2 вместо 287.5, щель −11.75).
          `contain: size` объявляет, что размер элемента не зависит от
          содержимого, — вклад героя в высоту строк становится нулевым, и
          источник остаётся ровно один. `min-height: 0` и `height: 100%` тут
          бесполезны: первый влияет на минимальный вклад, а не на
          max-content, второй при неопределённой строке трактуется как `auto`
          (оба проверены замером, оба ничего не изменили).

          Цена: герой получает не ровно 4:3. При колонке 383.33 и зазоре 20
          строка равна 287.5, сетка 2×287.5 + 20 = 595, ширина героя
          2×383.33 + 20 = 786.67, пропорция 1.32213 вместо 1.33333 —
          отклонение 0.84 %. Обложка режется `object-cover`.

          Пропорция у героя остаётся условно: при items.length < 2 в сетке нет
          ни одной малой карточки, задающей высоту строк, и герой схлопнулся
          бы в ноль (у NewsCard нет собственной высоты — всё `h-full` и
          `absolute`). Два литеральных className в тернарнике, не склейка
          фрагментов: сканер Tailwind читает исходник как текст. */}
      <div className="mt-6 hidden gap-5 md:grid md:grid-cols-3 md:grid-rows-2">
        {hero && (
          <div
            className={
              items.length < 2
                ? "md:col-span-2 md:row-span-2 md:contain-size md:aspect-[4/3]"
                : "md:col-span-2 md:row-span-2 md:contain-size"
            }
          >
            <NewsCard item={hero} size="hero" priority />
          </div>
        )}
        {second && (
          <div className="md:col-span-1 md:row-span-1 md:aspect-[4/3]">
            <NewsCard item={second} />
          </div>
        )}
        {third && (
          <div className="md:col-span-1 md:row-span-1 md:aspect-[4/3]">
            <NewsCard item={third} />
          </div>
        )}
      </div>
    </section>
  );
}
