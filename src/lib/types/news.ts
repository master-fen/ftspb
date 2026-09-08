export type NewsCategory = "Общее" | "Федерация" | "Коллегия судей";

/** Машинное значение раздела — как в колонке `news.section` (`section_enum`). */
export type NewsSection = "federation" | "referees";

export type NewsAttachment = {
  kind: string;
  title: string;
  size?: string;
  url?: string;
};

export type NewsItem = {
  id: string;
  category: NewsCategory;
  /**
   * Раздел новости; `null` — «Общее». Фильтровать по нему, а не по `category`
   * (та — русская подпись для отображения). Опционально только из-за мок-фикстур
   * `src/data/news-archive.ts` (Lovable-зона, поля там нет): всё, что отдаёт
   * `src/server/news.ts`, заполняет его всегда.
   */
  section?: NewsSection | null;
  date: string; // dd.mm.yy
  title: string;
  excerpt?: string;
  /** HTML string: p / strong / ul / ol / h2 / h3 / blockquote / a */
  body?: string;
  attachments?: NewsAttachment[];
  /** Отсутствует, если у новости нет изображения — в списках показывается заглушка. */
  cover?: string;
  /** Дополнительные фотографии новости, без обложки (см. cover), position ASC. */
  gallery?: string[];
  featured?: boolean;
  /**
   * Embed-адрес видео Kinescope (`https://kinescope.io/embed/<id>`) или `null`.
   * Отдаёт только деталка (`getNewsBySlug`); в списках (`listNews` и др.) ключа
   * нет. Необязательно из-за мок-фикстур `src/data/news-archive.ts` (Lovable-зона).
   */
  videoUrl?: string | null;
  /**
   * `news.hide_cover_on_page`: страница новости не показывает `cover` вовсе;
   * карточки списков, главная, «Читайте также» и `og:image` читают `cover` как
   * раньше. `undefined` = `false` — необязательно из-за мок-фикстур
   * `src/data/news-archive.ts` (Lovable-зона); `src/server/news.ts` заполняет всегда.
   */
  hideCoverOnPage?: boolean;
  /**
   * `news.published_at` как в колонке: `YYYY-MM-DD`, без времени и зоны — их в
   * данных нет, и выдумывать не надо. Для machine-readable мета (article:*,
   * JSON-LD); отображение — по-прежнему `date`. Необязательно из-за мок-фикстур.
   */
  publishedAtIso?: string;
  /** `news.updated_at`, полный ISO-8601 (`toISOString()`). Необязательно из-за мок-фикстур. */
  updatedAtIso?: string;
};
