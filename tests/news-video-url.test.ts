import { describe, expect, test } from "bun:test";
import { KINESCOPE_HOSTS, normalizeVideoUrl } from "@/lib/news-video-url";

const ID = "xt4Yo1fCPJRC3GyTQUUe3N";
const EMBED = `https://kinescope.io/embed/${ID}`;

describe("normalizeVideoUrl — принимает", () => {
  test("короткая ссылка /ID → embed-адрес", () => {
    expect(normalizeVideoUrl(`https://kinescope.io/${ID}`)).toEqual({ ok: true, url: EMBED });
  });

  test("embed-адрес остаётся без изменений (повторное сохранение из формы)", () => {
    expect(normalizeVideoUrl(EMBED)).toEqual({ ok: true, url: EMBED });
  });

  test("query отбрасывается", () => {
    expect(normalizeVideoUrl(`${EMBED}?autoplay=1`)).toEqual({ ok: true, url: EMBED });
  });

  test("query и hash у короткой ссылки отбрасываются", () => {
    expect(normalizeVideoUrl(`https://kinescope.io/${ID}?x=1#top`)).toEqual({
      ok: true,
      url: EMBED,
    });
  });

  test("http, www, числовой ID, конечный слэш → https без www", () => {
    expect(normalizeVideoUrl("http://www.kinescope.io/204845565/")).toEqual({
      ok: true,
      url: "https://kinescope.io/embed/204845565",
    });
  });

  test("пробелы по краям обрезаются", () => {
    expect(normalizeVideoUrl(`  \t${EMBED}\n `)).toEqual({ ok: true, url: EMBED });
  });
});

describe("normalizeVideoUrl — отклоняет", () => {
  test("поддомен-подделка kinescope.io.evil.com", () => {
    expect(normalizeVideoUrl(`https://kinescope.io.evil.com/${ID}`)).toEqual({
      ok: false,
      message: "Поддерживаются только ссылки на kinescope.io",
    });
  });

  test("kinescope.io в пути чужого хоста", () => {
    expect(normalizeVideoUrl(`https://evil.com/kinescope.io/${ID}`)).toEqual({
      ok: false,
      message: "Поддерживаются только ссылки на kinescope.io",
    });
  });

  test("хост с суффиксом kinescope.io (notkinescope.io)", () => {
    expect(normalizeVideoUrl(`https://notkinescope.io/${ID}`)).toEqual({
      ok: false,
      message: "Поддерживаются только ссылки на kinescope.io",
    });
  });

  test("хост с портом", () => {
    expect(normalizeVideoUrl(`https://kinescope.io:8443/${ID}`).ok).toBe(false);
  });

  test("/embed/ без ID", () => {
    expect(normalizeVideoUrl("https://kinescope.io/embed/").ok).toBe(false);
  });

  test("/embed без слэша — слово embed не ID", () => {
    expect(normalizeVideoUrl("https://kinescope.io/embed").ok).toBe(false);
  });

  test("лишний сегмент после ID", () => {
    expect(normalizeVideoUrl(`https://kinescope.io/embed/${ID}/extra`).ok).toBe(false);
  });

  test("ID длиннее 64 символов", () => {
    expect(normalizeVideoUrl(`https://kinescope.io/${"a".repeat(64)}`).ok).toBe(true);
    expect(normalizeVideoUrl(`https://kinescope.io/${"a".repeat(65)}`).ok).toBe(false);
  });

  test("ID с недопустимыми символами", () => {
    expect(normalizeVideoUrl("https://kinescope.io/embed/ab-cd").ok).toBe(false);
  });

  test("javascript: — отказ, а не исключение", () => {
    let result: ReturnType<typeof normalizeVideoUrl> | undefined;
    expect(() => {
      result = normalizeVideoUrl("javascript:alert(1)");
    }).not.toThrow();
    expect(result?.ok).toBe(false);
  });

  test("ftp: на правильном хосте", () => {
    expect(normalizeVideoUrl(`ftp://kinescope.io/${ID}`)).toEqual({
      ok: false,
      message: "Ссылка должна начинаться с http:// или https://",
    });
  });

  test("не URL вообще — отказ, а не исключение", () => {
    let result: ReturnType<typeof normalizeVideoUrl> | undefined;
    expect(() => {
      result = normalizeVideoUrl("просто текст");
    }).not.toThrow();
    expect(result).toEqual({ ok: false, message: "Некорректная ссылка" });
  });
});

describe("KINESCOPE_HOSTS", () => {
  test("ровно два хоста, без суффиксов", () => {
    expect([...KINESCOPE_HOSTS]).toEqual(["kinescope.io", "www.kinescope.io"]);
  });
});
