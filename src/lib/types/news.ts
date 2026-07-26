export type NewsCategory = "Общее" | "Федерация";

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
  cover: string;
  featured?: boolean;
};
