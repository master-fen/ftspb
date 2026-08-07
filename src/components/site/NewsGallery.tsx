import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { NewsImage } from "./NewsImage";

type NewsGalleryProps = {
  cover?: string;
  gallery: string[];
  title: string;
};

/**
 * Просмотрщик фотографий новости: обложка крупно (hero) + сетка миниатюр
 * из остальных фото, по клику — лайтбокс с навигацией (стрелки, клавиатура,
 * свайп) по обложке и галерее вместе.
 */
export function NewsGallery({ cover, gallery, title }: NewsGalleryProps) {
  const images = cover ? [cover, ...gallery] : gallery;
  const coverOffset = cover ? 1 : 0;
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
      {cover ? (
        <figure className="overflow-hidden rounded-2xl bg-muted shadow-sm ring-1 ring-black/5">
          <button
            type="button"
            onClick={() => setOpenIndex(0)}
            aria-label="Открыть фотографию"
            className="flex w-full cursor-zoom-in justify-center"
          >
            <img
              src={cover}
              alt={title}
              className="max-h-[680px] w-auto max-w-full object-contain"
            />
          </button>
        </figure>
      ) : null}

      {gallery.length > 0 ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:gap-3">
            {gallery.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setOpenIndex(i + coverOffset)}
                aria-label={`Фото ${i + coverOffset + 1} из ${images.length}`}
                className="aspect-[4/3] overflow-hidden rounded-lg bg-muted ring-1 ring-black/5 transition-opacity hover:opacity-85"
              >
                <NewsImage
                  src={src}
                  alt={`${title} — фото ${i + coverOffset + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {images.length} фото — нажмите, чтобы открыть
          </p>
        </>
      ) : null}

      {openIndex !== null && mounted
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${title}: фото ${openIndex + 1} из ${images.length}`}
              className="animate-in fade-in-0 fixed inset-0 z-[100] flex h-dvh flex-col bg-brand-navy/95 duration-200"
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
              <div className="flex items-center justify-between px-4 py-3 text-white/90">
                <span className="text-sm font-semibold tabular-nums">
                  {openIndex + 1} / {images.length}
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Закрыть"
                  className="rounded-full p-2 transition-colors hover:bg-white/10"
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
                      className="absolute left-2 hidden rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 md:block"
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
                      className="absolute right-2 hidden rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 md:block"
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
