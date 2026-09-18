import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { NewsImage } from "./NewsImage";
import { galleryImages, galleryLayout } from "@/lib/gallery-layout";

type NewsGalleryProps = {
  cover?: string;
  gallery: string[];
  title: string;
  /**
   * Индекс открытого кадра (по списку `galleryImages(cover, gallery)`) или
   * `null` — закрыт. Компонент управляемый: состояние живёт у владельца
   * (маршрут выводит его из hash адреса), здесь только колбэки.
   */
  openIndex: number | null;
  /** Открыть кадр `index` — клик по hero или миниатюре. */
  onOpen: (index: number) => void;
  /** Перейти к кадру `index` при открытом лайтбоксе — полоса, стрелки, клавиши, свайп. */
  onStep: (index: number) => void;
  /** Закрыть — ✕, Esc, клик по фону. */
  onClose: () => void;
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

/*
 * Кадры полосы превью лайтбокса. Активный — оранжевая рамка без приглушения,
 * остальные приглушены и проявляются по наведению.
 */
const STRIP_ITEM =
  "h-14 w-20 shrink-0 overflow-hidden rounded-md bg-overlay-control opacity-60 ring-1 ring-overlay-control transition-opacity hover:opacity-100 sm:h-16 sm:w-24";
const STRIP_ITEM_ACTIVE =
  "h-14 w-20 shrink-0 overflow-hidden rounded-md bg-overlay-control ring-2 ring-brand-orange sm:h-16 sm:w-24";

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
 * Лайтбокс: область кадра, под ней полоса превью со всеми фото, активный кадр
 * подкручивается в видимую часть полосы. Свайп живёт на области кадра, а не на
 * корне диалога: полоса прокручивается пальцем по горизонтали, и на корне такой
 * жест считался бы перелистыванием. Фокус при открытии уходит на ✕, при
 * закрытии возвращается на кнопку, которой открывали; ловушки фокуса нет —
 * Tab уходит на страницу.
 *
 * Длину ряда задаёт CSS, а не JS: в разметку уходит ряд широкого экрана, лишняя
 * миниатюра скрыта классом. Ширины окна на сервере нет, и измерение дало бы в
 * SSR одну разметку, а после гидрации другую.
 *
 * Открытый кадр компонент не хранит: `openIndex` приходит от владельца, все
 * действия уходят колбэками. Владелец — страница новости — выводит индекс из
 * hash адреса `#photo=N` (src/lib/photo-hash.ts), так что «назад» браузера
 * закрывает лайтбокс, а ссылка на кадр переживает F5.
 */
export function NewsGallery({
  cover,
  gallery,
  title,
  openIndex,
  onOpen,
  onStep,
  onClose,
}: NewsGalleryProps) {
  const images = galleryImages(cover, gallery);
  const narrow = galleryLayout(images.length, COLUMNS_NARROW);
  const wide = galleryLayout(images.length, COLUMNS_WIDE);
  const row = images.slice(1, wide.thumbs + 1);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const hasMany = images.length > 1;

  const close = onClose;
  const step = useCallback(
    (delta: number) => {
      if (openIndex === null) return;
      onStep((openIndex + delta + images.length) % images.length);
    },
    [openIndex, images.length, onStep],
  );

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      // Автоповтор при удержании: каждый шаг — replaceState, а у браузеров есть
      // предел частоты вызовов History API (Chromium и Firefox — 200 за 10 с,
      // WebKit — 100 за 10 с); удержание стрелки шлёт десятки событий в секунду.
      if (e.repeat) return;
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
  /**
   * Кнопка, которой открыли лайтбокс, — ей возвращается фокус при закрытии.
   * Пуста, если открыли адресом (`#photo=N` при заходе): тогда фокус уходит на
   * hero-кнопку — якорь фотоблока, которым лайтбокс открывают заново.
   */
  const openerRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const isOpen = openIndex !== null;
  /**
   * Факт показа, не факт открытости: при заходе по адресу с hash `isOpen`
   * истинен уже в первом рендере, а портал появляется только после `mounted` —
   * эффект по `isOpen` отработал бы раньше ✕ и фокус на неё не встал бы.
   */
  const showing = isOpen && mounted;
  /** Сторож: возвращать фокус только после закрытия, не при монтировании страницы. */
  const wasOpenRef = useRef(false);

  // Зависимость — только факт показа: от openIndex фокус прыгал бы на ✕ при
  // каждом перелистывании и отбирал его у кнопки полосы, по которой кликнули.
  // preventScroll при возврате: focus() доскролливает срезанную кнопку в кадр,
  // и страница под закрытым лайтбоксом уезжала (300 → 398 при срезанной hero).
  useEffect(() => {
    if (showing) closeRef.current?.focus();
    else if (wasOpenRef.current)
      (openerRef.current ?? heroRef.current)?.focus({ preventScroll: true });
    wasOpenRef.current = showing;
  }, [showing]);

  // behavior "auto", не "smooth": при открытии плавная прокрутка ехала бы от нуля
  // поверх проявления кадра. block "nearest" — не тянуть предков.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
  }, [openIndex]);

  return (
    <>
      {images.length > 0 ? (
        <figure className="overflow-hidden rounded-2xl bg-muted ring-1 ring-media-border">
          <button
            ref={heroRef}
            type="button"
            onClick={(e) => {
              openerRef.current = e.currentTarget;
              onOpen(0);
            }}
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
                  onClick={(e) => {
                    openerRef.current = e.currentTarget;
                    onOpen(index);
                  }}
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

      {showing && openIndex !== null
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${title}: фото ${openIndex + 1} из ${images.length}`}
              className="animate-in fade-in-0 fixed inset-0 z-[100] flex h-dvh flex-col bg-overlay duration-200"
              onClick={close}
            >
              <div className="flex items-center justify-between px-4 py-3 text-inverse-foreground">
                <span className="text-sm font-semibold tabular-nums">
                  {openIndex + 1} / {images.length}
                </span>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={close}
                  aria-label="Закрыть"
                  className="rounded-full p-2 transition-colors hover:bg-overlay-control"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Свайп — здесь, не на корне: полоса ниже прокручивается пальцем. */}
              <div
                className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-3"
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

              {hasMany ? (
                // Обёртка отдельная: у элемента, который прячет media-запрос, не
                // должно быть конкурирующей утилиты display — порядок правил для
                // произвольного варианта в собранном CSS не доказан. Ниже 480 px
                // высоты полоса скрыта: кадру не остаётся места.
                <div className="shrink-0 [@media(max-height:479px)]:hidden">
                  {/* Клик по полосе не должен доходить до корня — тот закрывает диалог. */}
                  {/* pt-1: ring-2 активного кадра — тень на 2 px снаружи кнопки, а overflow-x-auto
                      обрезает и по вертикали (вторая ось перестаёт быть visible); снизу и по бокам
                      место дают pb-3 и px-3, сверху без отступа обводка срезалась. */}
                  <div
                    className="flex gap-2 overflow-x-auto px-3 pt-1 pb-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {images.map((src, i) => (
                      <button
                        key={src}
                        ref={i === openIndex ? activeRef : undefined}
                        type="button"
                        aria-label={`Фото ${i + 1}`}
                        aria-current={i === openIndex ? "true" : undefined}
                        onClick={() => onStep(i)}
                        className={i === openIndex ? STRIP_ITEM_ACTIVE : STRIP_ITEM}
                      >
                        {/* Не NewsImage: его светлый skeleton на тёмном оверлее — россыпь мигающих пятен. */}
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
