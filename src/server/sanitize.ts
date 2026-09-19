import sanitizeHtmlLib from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "a",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "blockquote",
  // Таблицы результатов (архив, /news/СЛАГ): без расширения списка правка
  // архивной новости через админку молча уничтожала бы таблицу. Оформление —
  // `.news-prose` в src/styles.css, обёртка прокрутки — NewsBody.
  "table",
  "caption",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
];

/**
 * `nonTextTags` заменяет дефолтный список sanitize-html целиком, а не
 * дополняет его — дефолт (`script,style,textarea,option`) нужно перечислить
 * явно, иначе он выпадет и `<script>`/`<style>` вместо удаления вместе с
 * содержимым превратятся в текстовый узел.
 */
const NON_TEXT_TAGS = ["script", "style", "textarea", "option", "iframe", "object", "embed"];

export function sanitizeBody(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      // У ячеек — только объединение; style и обработчики событий вырезаются.
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    nonTextTags: NON_TEXT_TAGS,
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform("a", { rel: "noopener noreferrer" }, true),
    },
  });
}
