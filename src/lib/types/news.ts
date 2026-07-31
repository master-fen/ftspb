export type NewsCategory = "Общее" | "Федерация" | "Коллегия судей";

export type NewsAttachment = {
  kind: "PDF" | "DOC" | "XLS";
  title: string;
  size?: string;
};

export type NewsItem = {
  id: string;
  category: NewsCategory;
  date: string; // dd.mm.yy
  title: string;
  excerpt?: string;
  /** HTML string: p / strong / ul / ol / h2 / h3 / blockquote / a */
  body?: string;
  attachments?: NewsAttachment[];
  /** Отсутствует, если у новости нет изображения — в списках показывается заглушка. */
  cover?: string;
  /** Все фотографии новости (первая обычно совпадает с cover). */
  gallery?: string[];
  featured?: boolean;
};
