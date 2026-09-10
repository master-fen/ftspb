/**
 * Прокрутка к якорю за фиксированное время. Нативный
 * `scrollIntoView({ behavior: "smooth" })` длится столько, сколько решит
 * браузер, и зависит от расстояния — настроить это нельзя. Здесь длительность
 * задаётся явно (по умолчанию 300 мс).
 *
 * К `window` модуль не обращается на верхнем уровне: файл импортируется и в
 * серверный бандл тоже.
 */

/** Длительность по умолчанию, мс. */
export const SCROLL_DURATION_MS = 300;

/**
 * Целевая позиция прокрутки. Чистая функция от чисел — вся работа с DOM
 * снаружи, поэтому её можно проверить тестом.
 *
 * `scrollMarginTop` вычитается обязательно: у разделов Устава стоит
 * `scroll-mt-24`, и без вычета заголовок упрётся в верхний край окна — это был
 * бы регресс против нынешнего поведения. Значение читается из вычисленного
 * стиля элемента (см. `scrollToElement`), а не зашивается числом.
 */
export function targetScrollTop({
  rectTop,
  scrollY,
  scrollMarginTop,
}: {
  /** `getBoundingClientRect().top` элемента — от верха окна. */
  rectTop: number;
  /** Текущая прокрутка страницы. */
  scrollY: number;
  /** Вычисленный `scroll-margin-top` элемента, px. */
  scrollMarginTop: number;
}): number {
  return rectTop + scrollY - scrollMarginTop;
}

/**
 * Сглаживание: 0 → 0, 1 → 1, монотонно возрастает на [0, 1].
 * Кубическое ease-in-out — быстрее в середине, мягче на концах.
 */
export function easeInOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Ограничение цели рамками страницы: за них браузер всё равно не пустит. */
function clampToDocument(top: number): number {
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  return Math.min(Math.max(top, 0), max);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Прокручивает окно к элементу за `durationMs`. При системной настройке
 * «уменьшить движение» — мгновенно, без анимации.
 *
 * Анимация отменяется по действию пользователя (`wheel`, `touchstart`,
 * `keydown`): иначе прокрутка дерётся с человеком, который в этот момент сам
 * крутит страницу.
 */
export function scrollToElement(
  element: Element,
  { durationMs = SCROLL_DURATION_MS }: { durationMs?: number } = {},
): void {
  const scrollMarginTop = parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
  const to = clampToDocument(
    targetScrollTop({
      rectTop: element.getBoundingClientRect().top,
      scrollY: window.scrollY,
      scrollMarginTop,
    }),
  );

  if (prefersReducedMotion() || durationMs <= 0) {
    window.scrollTo(0, to);
    return;
  }

  const from = window.scrollY;
  const distance = to - from;
  if (distance === 0) return;

  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  const events = ["wheel", "touchstart", "keydown"] as const;
  for (const type of events) {
    window.addEventListener(type, cancel, { passive: true, once: true });
  }
  const cleanup = () => {
    for (const type of events) window.removeEventListener(type, cancel);
  };

  const start = performance.now();
  const step = (now: number) => {
    if (cancelled) {
      cleanup();
      return;
    }
    const t = Math.min(1, (now - start) / durationMs);
    window.scrollTo(0, from + distance * easeInOutCubic(t));
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      cleanup();
    }
  };
  requestAnimationFrame(step);
}

/** То же по идентификатору якоря. Возвращает `false`, если элемента нет. */
export function scrollToAnchor(id: string, options?: { durationMs?: number }): boolean {
  const element = document.getElementById(id);
  if (element === null) return false;
  scrollToElement(element, options);
  return true;
}
