/**
 * Откуда человек пришёл на страницу новости (`?from=`). Определяет хлебные
 * крошки на `/news/$newsId` — путь, которым пришли, а не свойство новости.
 * Единственный источник допустимых значений: и для zod-схемы роута, и для
 * пропа `NewsListCard`.
 */
export const NEWS_ORIGINS = ["federation"] as const;

export type NewsOrigin = (typeof NEWS_ORIGINS)[number];
