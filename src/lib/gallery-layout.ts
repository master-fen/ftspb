/**
 * Раскладка фотоблока новости: одно фото крупно (`images[0]`) и один ряд
 * миниатюр из `images[1…]`; всё, что в ряд не поместилось, доступно только из
 * лайтбокса, а на последней миниатюре ряда стоит плашка «+N».
 */
export type GalleryLayout = {
  /** Сколько миниатюр помещается в ряд; большое фото в счёт не идёт. */
  thumbs: number;
  /** Сколько фото не попало ни в большое, ни в ряд, — число на плашке. */
  hiddenCount: number;
  /**
   * Индекс миниатюры с плашкой — индекс в `images`, где `images[0]` большое
   * фото. `null`, когда прятать нечего. Прятать есть что только при полном
   * ряде, поэтому плашка всегда приходится на последнюю миниатюру ряда.
   */
  overlayIndex: number | null;
};

/**
 * `total` — всего фото у новости, `columns` — сколько миниатюр помещается в ряд
 * на текущей ширине. Ширину задаёт CSS (`grid-cols-3` ниже `sm`,
 * `sm:grid-cols-4` от `sm`), в JS она не измеряется: на сервере ширины нет, и
 * `matchMedia` дал бы в SSR одну разметку, а после гидрации другую. Поэтому
 * `NewsGallery` вызывает функцию по разу на каждую ширину, а лишняя миниатюра
 * прячется классом.
 *
 * Инвариант двойного вызова (здесь не проверяется — он про пару вызовов, а не
 * про одну): `galleryLayout(total, 3).overlayIndex <= galleryLayout(total, 4).thumbs`.
 * Миниатюра с «узкой» плашкой обязана присутствовать в разметке широкого ряда —
 * разметка одна на обе ширины, и иначе ниже `sm` плашки просто не было бы.
 */
export function galleryLayout(total: number, columns: number): GalleryLayout {
  const rest = Math.max(total - 1, 0);
  const thumbs = Math.min(rest, columns);
  const hiddenCount = Math.max(rest - columns, 0);
  return { thumbs, hiddenCount, overlayIndex: hiddenCount > 0 ? columns : null };
}

/**
 * Список фото страницы: обложка первой, затем галерея; без обложки — галерея
 * как есть. Одна функция на маршрут и компонент: нумерация `#photo=N` и
 * счётчик «N / total» считаются по одному и тому же списку.
 */
export function galleryImages(cover: string | undefined, gallery: string[]): string[] {
  return cover ? [cover, ...gallery] : gallery;
}
