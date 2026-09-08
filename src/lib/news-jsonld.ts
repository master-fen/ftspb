/**
 * JSON-LD schema.org/NewsArticle для страницы новости. Чистый модуль без
 * зависимостей: собирает объект и сериализует его для `<script type="application/ld+json">`.
 */

export type NewsArticleJsonLdInput = {
  title: string;
  description: string;
  /** Канонический абсолютный URL страницы. */
  url: string;
  /** Абсолютный URL картинки; без него ключа `image` в объекте нет. */
  image?: string;
  /** `YYYY-MM-DD` как в колонке `published_at`; без него объект не строится (null). */
  datePublished?: string;
  /** Полный ISO-8601 из `updated_at`; без него ключа `dateModified` нет. */
  dateModified?: string;
  publisherName: string;
};

export type NewsArticleJsonLd = {
  "@context": "https://schema.org";
  "@type": "NewsArticle";
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  image?: string[];
  mainEntityOfPage: { "@type": "WebPage"; "@id": string };
  publisher: { "@type": "Organization"; name: string };
};

/**
 * `null`, если нет `datePublished`: NewsArticle без даты публикации поисковикам
 * бесполезен, а выдумывать дату нельзя (мок-фикстуры без БД).
 * Логотип publisher намеренно не добавляется: абсолютного адреса логотипа в
 * проекте нет (см. src/lib/site.ts).
 */
export function buildNewsArticleJsonLd(input: NewsArticleJsonLdInput): NewsArticleJsonLd | null {
  if (!input.datePublished) return null;
  const result: NewsArticleJsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: input.title,
    description: input.description,
    datePublished: input.datePublished,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    publisher: { "@type": "Organization", name: input.publisherName },
  };
  if (input.dateModified) result.dateModified = input.dateModified;
  if (input.image) result.image = [input.image];
  return result;
}

/**
 * JSON для вставки внутрь `<script>`: `<` → `<`, чтобы содержимое
 * (заголовок с `</script>` и т. п.) не могло закрыть тег. JSON от этого не
 * меняется — `<` парсится обратно в `<`.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
