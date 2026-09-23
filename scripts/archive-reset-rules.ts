/**
 * Решения скрипта перезаливки локальной схемы, вынесенные из
 * scripts/reset-archive.ts, чтобы их можно было проверить тестами без базы.
 *
 * Скрипт читает строки, эта функция принимает ВСЕ решения, и только потом
 * скрипт пишет — тот же порядок фаз, что у мигратора архива
 * (scripts/archive-migration-rules.ts).
 *
 * Потребитель один — scripts/reset-archive.ts под bun, поэтому импорты идут
 * без расширения.
 */

/**
 * Адрес легаси в колонке `news.source`. По нему архивная новость отличается
 * от заведённой руками: у первой это адрес страницы или ленты легаси, у
 * второй `NULL`. Третьего вида в схеме нет — проверено замером 22.09.2026
 * (1946 архивных против 47 ручных на схеме `dev`).
 */
export const LEGACY_SOURCE_PREFIX = "https://www.tennisfed.spb.ru/";

/** Строка `news`, как её читает скрипт перед решением. */
export type NewsRow = { id: string; source: string | null };
/** Строка `news_document`. */
export type LinkRow = { newsId: string; documentId: string };
/** Строка `news_photo` — нужен только владелец. */
export type PhotoRow = { newsId: string };

export type ResetCounts = { news: number; photo: number; document: number; link: number };

export type ResetPlan = {
  /** Новости к удалению: `news_photo` и `news_document` уйдут каскадом. */
  newsIds: string[];
  /** Документы к удалению: их `news_document` уйдут каскадом. */
  documentIds: string[];
  before: ResetCounts;
  /** Предсказание: столько строк останется. Скрипт сверяет с замером после. */
  after: ResetCounts;
};

export function isArchiveSource(source: string | null): boolean {
  return source !== null && source.startsWith(LEGACY_SOURCE_PREFIX);
}

/**
 * Что снести, чтобы на схеме остались только новости редактора.
 *
 * Документ удаляется, если привязан хотя бы к одной архивной новости и ни к
 * одной другой: каскада от `news` к `document` нет — `news_document` уходит
 * каскадом, сама строка `document` остаётся. Документ, не привязанный ни к
 * чему, не трогается: он мог быть загружен админкой отдельно.
 *
 * Связь, ведущая на неизвестную новость, считается неархивной и документ
 * сохраняет: направление отказа безопасное. Внешний ключ такого не допускает,
 * и появиться это может только при несогласованном чтении.
 */
export function planArchiveReset(input: {
  news: ReadonlyArray<NewsRow>;
  photos: ReadonlyArray<PhotoRow>;
  documentIds: ReadonlyArray<string>;
  links: ReadonlyArray<LinkRow>;
}): ResetPlan {
  const { news, photos, documentIds, links } = input;

  const archiveNews = new Set(news.filter((n) => isArchiveSource(n.source)).map((n) => n.id));

  const linkedToArchive = new Set<string>();
  const linkedToOther = new Set<string>();
  for (const l of links) {
    if (archiveNews.has(l.newsId)) linkedToArchive.add(l.documentId);
    else linkedToOther.add(l.documentId);
  }
  const docsToDelete = new Set(
    documentIds.filter((id) => linkedToArchive.has(id) && !linkedToOther.has(id)),
  );

  const before: ResetCounts = {
    news: news.length,
    photo: photos.length,
    document: documentIds.length,
    link: links.length,
  };
  const after: ResetCounts = {
    news: news.length - archiveNews.size,
    photo: photos.filter((p) => !archiveNews.has(p.newsId)).length,
    document: documentIds.length - docsToDelete.size,
    link: links.filter((l) => !archiveNews.has(l.newsId) && !docsToDelete.has(l.documentId)).length,
  };

  return {
    newsIds: [...archiveNews],
    documentIds: [...docsToDelete],
    before,
    after,
  };
}
