import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { NewsImage } from "./NewsImage";
import { galleryLayout } from "@/lib/gallery-layout";

type NewsGalleryProps = {
  cover?: string;
  gallery: string[];
  title: string;
};

/** Колонки ряда миниатюр — те же числа, что в классах сетки ниже. */
const COLUMNS_NARROW = 3;
const COLUMNS_WIDE = 4;

/*
 * Строки классов выписаны целиком и выбираются ветвлением, а не собираются из
 * кусков: сканер Tailwind читает исходник как текст (docs/style-rules.md,
 * «Запрещено»). THUMB — вид миниатюры, он же был и до появления плашки;
 * остальные три добавляют relative (точка отсчёта для плашки) и hidden sm:block
 * (четвёртая миниатюра — в ряду из трёх её нет).
 */
const THUMB =
  "aspect-[4/3] overflow-hidden rounded-lg bg-muted ring-1 ring-media-border transition-opacity hover:opacity-85";
const THUMB_PLAQUE =
  "relative aspect-[4/3] overflow-hidden rounded-lg bg-muted ring-1 ring-media-border transition-opacity hover:opacity-85";
const THUMB_WIDE =
  "aspect-[4/3] overflow-hidden rounded-lg bg-muted ring-1 ring-media-border transition-opacity hover:opacity-85 hidden sm:block";
const THUMB_WIDE_PLAQUE =
  "relative aspect-[4/3] overflow-hidden rounded-lg bg-muted ring-1 ring-media-border transition-opacity hover:opacity-85 hidden sm:block";

/*
 * Плашка «+N» поверх миниатюры. PLAQUE_NARROW — плашка ряда из трёх: от sm ряд
 * другой, и она прячется. Плашка ряда из четырёх своего класса видимости не
 * несёт — её миниатюра ниже sm скрыта целиком.
 */
const PLAQUE =
  "absolute inset-0 flex items-center justify-center bg-media-scrim text-2xl font-semibold tabular-nums text-inverse-foreground";
const PLAQUE_NARROW =
  "absolute inset-0 flex items-center justify-center bg-media-scrim text-2xl font-semibold tabular-nums text-inverse-foreground sm:hidden";

function thumbClass(wideOnly: boolean, plaque: boolean): string {
  if (wideOnly) return plaque ? THUMB_WIDE_PLAQUE : THUMB_WIDE;
  return plaque ? THUMB_PLAQUE : THUMB;
}

/**
 * Просмотрщик фотографий новости: первое фото крупно (hero) и один ряд
 * миниатюр — три ниже `sm`, четыре от `sm`. На последней миниатюре ряда —
 * плашка «+N» с числом фото, которые в ряд не поместились; сами эти фото
 * доступны только из лайтбокса. По клику (в том числе по плашке) открывается
 * лайтбокс с навигацией (стрелки, клавиатура, свайп) по всем фото новости.
 *
 * Длину ряда задаёт CSS, а не JS: в разметку уходит ряд широкого экрана, лишняя
 * миниатюра скрыта классом. Ширины окна на сервере нет, и измерение дало бы в
 * SSR одну разметку, а после гидрации другую.
 */
export function NewsGallery({ cover, gallery, title }: NewsGalleryProps) {
  const images = cover ? [cover, ...gallery] : gallery;
  const narrow = galleryLayout(images.length, COLUMNS_NARROW);
  const wide = galleryLayout(images.length, COLUMNS_WIDE);
  const row = images.slice(1, wide.thumbs + 1);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const hasMany = images.length > 1;

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setOpenIndex((i) => (i === null ? i : (i + delta + images.length) % images.length)),
    [images.length],
  );

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [openIndex, close, step]);

  const touchX = useRef<number | null>(null);

  return (
    <>
      {images.length > 0 ? (
        <figure className="overflow-hidden rounded-2xl bg-muted ring-1 ring-media-border">
          <button
            type="button"
            onClick={() => setOpenIndex(0)}
            aria-label="Открыть фотографию"
            className="flex w-full cursor-zoom-in justify-center"
          >
            <img
              src={images[0]}
              alt={title}
              className="max-h-[680px] w-auto max-w-full object-contain"
            />
          </button>
        </figure>
      ) : null}

      {hasMany ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:gap-3">
            {row.map((src, i) => {
              // row начинается с images[1], поэтому индекс фото — i + 1.
              const index = i + 1;
              // Плашка стоит на последней миниатюре ряда, а ряды разной ширины
              // кончаются на разных фото: ниже sm — images[3], от sm — images[4].
              // Совпасть индексы не могут: колонок 3 и 4.
              const narrowPlaque = index === narrow.overlayIndex;
              const hasPlaque = narrowPlaque || index === wide.overlayIndex;
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => setOpenIndex(index)}
                  aria-label={`Фото ${index + 1} из ${images.length}`}
                  className={thumbClass(index > narrow.thumbs, hasPlaque)}
                >
                  <NewsImage
                    src={src}
                    alt={`${title} — фото ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {hasPlaque ? (
                    <span aria-hidden="true" className={narrowPlaque ? PLAQUE_NARROW : PLAQUE}>
                      {`+${narrowPlaque ? narrow.hiddenCount : wide.hiddenCount}`}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-2 ui-caption">{images.length} фото — нажмите, чтобы открыть</p>
        </>
      ) : null}

      {openIndex !== null && mounted
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${title}: фото ${openIndex + 1} из ${images.length}`}
              className="animate-in fade-in-0 fixed inset-0 z-[100] flex h-dvh flex-col bg-overlay duration-200"
              onClick={close}
              onTouchStart={(e) => {
                touchX.current = e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                if (touchX.current === null) return;
                const dx = e.changedTouches[0].clientX - touchX.current;
                if (Math.abs(dx) > 48) step(dx < 0 ? 1 : -1);
                touchX.current = null;
              }}
            >
              <div className="flex items-center justify-between px-4 py-3 text-inverse-foreground">
                <span className="text-sm font-semibold tabular-nums">
                  {openIndex + 1} / {images.length}
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Закрыть"
                  className="rounded-full p-2 transition-colors hover:bg-overlay-control"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-6">
                <img
                  key={images[openIndex]}
                  src={images[openIndex]}
                  alt={`${title} — фото ${openIndex + 1}`}
                  onClick={(e) => e.stopPropagation()}
                  className="animate-in fade-in-0 max-h-full max-w-full object-contain duration-200"
                />

                {hasMany ? (
                  <>
                    <button
                      type="button"
                      aria-label="Предыдущее фото"
                      onClick={(e) => {
                        e.stopPropagation();
                        step(-1);
                      }}
                      className="absolute left-2 hidden rounded-full bg-overlay-control p-3 text-inverse-foreground transition-colors hover:bg-overlay-control-hover md:block"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      type="button"
                      aria-label="Следующее фото"
                      onClick={(e) => {
                        e.stopPropagation();
                        step(1);
                      }}
                      className="absolute right-2 hidden rounded-full bg-overlay-control p-3 text-inverse-foreground transition-colors hover:bg-overlay-control-hover md:block"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  </>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
