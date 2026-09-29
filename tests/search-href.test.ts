import { describe, expect, test } from "bun:test";
import { resolveSearchHref } from "@/lib/search-href";

describe("resolveSearchHref", () => {
  test("внутренний адрес без якоря", () => {
    expect(resolveSearchHref("/federation/antidoping")).toEqual({
      to: "/federation/antidoping",
      external: false,
    });
  });

  test("внутренний адрес с якорем разбирается на to и hash", () => {
    expect(resolveSearchHref("/federation/charter/text#p-2-2")).toEqual({
      to: "/federation/charter/text",
      hash: "p-2-2",
      external: false,
    });
  });

  test("внешняя ссылка (S3) — external: true, to как есть", () => {
    const url = "https://s3.twcstorage.ru/ftspb-media/news/slug/documents/01.pdf";
    expect(resolveSearchHref(url)).toEqual({ to: url, external: true });
  });
});
