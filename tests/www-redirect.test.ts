import { describe, expect, test } from "bun:test";
import { wwwRedirectTarget } from "@/start";

function makeRequest(url: string, headers: Record<string, string>): Request {
  return new Request(url, { headers });
}

describe("wwwRedirectTarget", () => {
  test("x-forwarded-host с www → редирект на канонический домен, путь и query сохраняются", () => {
    const request = makeRequest("http://internal/news/1?x=1", {
      "x-forwarded-host": "www.spbtennisfed.ru",
    });
    expect(wwwRedirectTarget(request)).toBe("https://spbtennisfed.ru/news/1?x=1");
  });

  test("нет x-forwarded-host — фолбэк на host", () => {
    const request = makeRequest("http://internal/", { host: "www.spbtennisfed.ru" });
    expect(wwwRedirectTarget(request)).toBe("https://spbtennisfed.ru/");
  });

  test("host без www — не редиректит", () => {
    const request = makeRequest("http://internal/", { host: "spbtennisfed.ru" });
    expect(wwwRedirectTarget(request)).toBeNull();
  });

  test("localhost — не редиректит", () => {
    const request = makeRequest("http://internal/", { host: "localhost:3000" });
    expect(wwwRedirectTarget(request)).toBeNull();
  });

  test("x-forwarded-host пустой — трактуется как отсутствующий, фолбэк на host", () => {
    const request = makeRequest("http://internal/", {
      "x-forwarded-host": "",
      host: "www.spbtennisfed.ru",
    });
    expect(wwwRedirectTarget(request)).toBe("https://spbtennisfed.ru/");
  });

  test("несколько значений через запятую — берётся первое", () => {
    const request = makeRequest("http://internal/", {
      "x-forwarded-host": "www.a.ru, 10.0.0.1",
    });
    expect(wwwRedirectTarget(request)).toBe("https://a.ru/");
  });

  test("вырожденный host 'www.' без хвоста — не бросает, не редиректит", () => {
    const request = makeRequest("http://internal/", { host: "www." });
    expect(wwwRedirectTarget(request)).toBeNull();
  });

  test("нет хостовых заголовков вовсе — не бросает, не редиректит", () => {
    const request = makeRequest("http://internal/", {});
    expect(wwwRedirectTarget(request)).toBeNull();
  });

  test("технический домен twc1.net — не редиректит", () => {
    const request = makeRequest("http://internal/", {
      "x-forwarded-host": "master-fen-ftspb-4dd2.twc1.net",
    });
    expect(wwwRedirectTarget(request)).toBeNull();
  });
});
