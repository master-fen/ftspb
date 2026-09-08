import { describe, expect, test } from "bun:test";
import { buildNewsArticleJsonLd, serializeJsonLd } from "@/lib/news-jsonld";

const full = {
  title: "Скоро: Федерация изнутри",
  description: "Анонс серии материалов",
  url: "https://spbtennisfed.ru/news/skoro-federatsiya-iznutri",
  image: "https://s3.example/cover.jpg",
  datePublished: "2026-09-07",
  dateModified: "2026-09-07T22:32:43.953Z",
  publisherName: "Федерация тенниса Санкт-Петербурга",
};

describe("NewsArticle JSON-LD", () => {
  test("full input maps every field", () => {
    expect(buildNewsArticleJsonLd(full)).toEqual({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: full.title,
      description: full.description,
      datePublished: "2026-09-07",
      dateModified: "2026-09-07T22:32:43.953Z",
      image: ["https://s3.example/cover.jpg"],
      mainEntityOfPage: { "@type": "WebPage", "@id": full.url },
      publisher: { "@type": "Organization", name: full.publisherName },
    });
  });
  test("without image there is no image key at all", () => {
    const { image: _image, ...noImage } = full;
    const result = buildNewsArticleJsonLd(noImage);
    expect(result).not.toBeNull();
    expect(result && "image" in result).toBe(false);
  });
  test("without dateModified there is no dateModified key", () => {
    const { dateModified: _m, ...noModified } = full;
    const result = buildNewsArticleJsonLd(noModified);
    expect(result && "dateModified" in result).toBe(false);
  });
  test("without datePublished returns null (mock fixtures have no machine date)", () => {
    const { datePublished: _d, ...noDate } = full;
    expect(buildNewsArticleJsonLd(noDate)).toBeNull();
    expect(buildNewsArticleJsonLd({ ...full, datePublished: "" })).toBeNull();
  });
  test("serialization escapes < so </script> cannot close the tag, and stays valid JSON", () => {
    const obj = buildNewsArticleJsonLd({ ...full, title: 'x</script><img src=x onerror="1">' });
    const text = serializeJsonLd(obj);
    expect(text).not.toContain("<");
    expect(text).not.toContain("</script>");
    expect(text).toContain("\\u003c/script>");
    expect(JSON.parse(text)).toEqual(obj);
  });
});
