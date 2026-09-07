/**
 * Принимает только body, уже очищенный серверным sanitizeBody.
 * Оба формата сохраняют HTML-сущности, созданные при очистке (&amp;, &lt;).
 */
export function NewsBody({ body }: { body: string }) {
  const className = "news-prose text-base leading-7 text-foreground";
  const hasHtml = /<\/?[a-z][^>]*>/i.test(body);

  if (hasHtml) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: body }} />;
  }

  const paragraphs = body
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\r?\n/g, "<br>")}</p>`)
    .join("");
  return <div className={className} dangerouslySetInnerHTML={{ __html: paragraphs }} />;
}
