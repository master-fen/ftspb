/**
 * Адрес открытого кадра лайтбокса новости: `#photo=N`, N — номер фото с
 * единицы, как в счётчике «N / total». Один источник истины — hash адреса
 * роутера: `openIndex` выводится из него, а не хранится в состоянии компонента.
 *
 * Строго `photo=N`: без ведущих нулей, без пробелов, без хвоста — иначе `null`,
 * и страница ведёт себя как без hash (адрес не трогается: чужой якорь должен
 * пережить заход). Значение `hash` — как отдаёт роутер, без `#`.
 */
export const PHOTO_HASH_RE = /^photo=([1-9]\d*)$/;

/** Индекс кадра с нуля или `null`, если hash не наш или номер вне `1…total`. */
export function parsePhotoHash(hash: string, total: number): number | null {
  const m = PHOTO_HASH_RE.exec(hash);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isSafeInteger(n) || n > total) return null;
  return n - 1;
}

/** Обратная функция: индекс с нуля → `photo=N`. */
export function formatPhotoHash(index: number): string {
  return `photo=${index + 1}`;
}

/**
 * Маркер «эту запись истории создал лайтбокс» в `history.state`: закрытие
 * с маркером — шаг назад по истории, без него — replace на адрес без hash.
 * Интерфейс `HistoryState` объявлен пустым и расширяемым.
 */
declare module "@tanstack/history" {
  interface HistoryState {
    photoLightbox?: true;
  }
}
