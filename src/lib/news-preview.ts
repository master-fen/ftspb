/**
 * Предпросмотр новости для редактора — `/news/preview/ID`, ID — `news.id`
 * (uuid), не слаг: адрес не ломается при смене слага, вкладку можно просто
 * обновлять. Чистый модуль: его читают маршрут предпросмотра, полоса-пометка,
 * редактор новости и счётчик Метрики (`src/lib/analytics.ts`). Он уже лежит в
 * главном чанке, поэтому общие для полосы и редактора помощники живут здесь —
 * новый модуль, общий для двух чанков, стал бы отдельным чанком.
 */

/** Начало адреса предпросмотра; `/news/preview` без хвоста — обычный слаг «preview». */
export const NEWS_PREVIEW_PREFIX = "/news/preview/";

/** Форма uuid. Мусор отсеивается до запроса к БД: колонка `news.id` типа uuid,
 * и `eq` с не-uuid уронил бы запрос ошибкой Postgres, то есть 500. */
const NEWS_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isNewsId(value: string): boolean {
  return NEWS_ID_RE.test(value);
}

export function newsPreviewPath(id: string): string {
  return `${NEWS_PREVIEW_PREFIX}${id}`;
}

/**
 * Имя окна предпросмотра: одна вкладка на новость. Редактор открывает её
 * `window.open(…, имя)`, повторное нажатие попадает в ту же вкладку; по имени
 * полоса-пометка узнаёт, что вкладку открыл редактор и её можно закрыть.
 */
export function previewWindowName(id: string): string {
  return `ftspb-news-preview-${id}`;
}

/** Состояние новости для предпросмотра: удалённая — «удалена» при любом статусе. */
export type NewsPreviewState = "draft" | "published" | "deleted";

export const PREVIEW_STATES: Record<NewsPreviewState, { word: string; notice: string }> = {
  draft: { word: "Черновик", notice: "Черновик. Посетители сайта эту новость пока не видят." },
  published: { word: "Опубликована", notice: "Опубликована. Так новость видят посетители." },
  deleted: { word: "Удалена", notice: "Удалена. Посетители сайта эту новость не видят." },
};

/** Заголовок вкладки: «Черновик: ЗАГОЛОВОК — Федерация тенниса Санкт-Петербурга». */
export function previewTitle(state: NewsPreviewState, title: string): string {
  return `${PREVIEW_STATES[state].word}: ${title} — Федерация тенниса Санкт-Петербурга`;
}

/**
 * Ссылка на черновик для согласования — тот же маршрут с ключом:
 * `/news/preview/ID?key=ТОКЕН`. Ключ проверяет сервер в связке с ID
 * (src/server/news-share-link.ts).
 */
export function newsShareLinkPath(id: string, token: string): string {
  return `${newsPreviewPath(id)}?key=${encodeURIComponent(token)}`;
}

/** Полный адрес ссылки; origin выбирает редактор (прод — `SITE_URL`, локально — свой). */
export function newsShareUrl(origin: string, id: string, token: string): string {
  return `${origin}${newsShareLinkPath(id, token)}`;
}

/**
 * Ключ из search маршрута. Роутер разбирает значения как JSON (`?key=123` —
 * число), поэтому: параметра нет — `undefined` (вид «только редактору»);
 * строка — как есть; любое другое значение — пустая строка, то есть ключ есть,
 * но заведомо неверный.
 */
export function shareKeyParam(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : "";
}

/** Текст полосы на странице согласования; дата — `ДД.ММ.ГГГГ` по Москве, считает сервер. */
export function shareNotice(expiresOn: string): string {
  return `Черновик для согласования. На сайте ещё не опубликован. Ссылка действует до ${expiresOn}.`;
}
