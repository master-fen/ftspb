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
};
