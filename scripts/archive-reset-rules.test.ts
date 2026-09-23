import path from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import {
  LEGACY_SOURCE_PREFIX,
  type LinkRow,
  type NewsRow,
  isArchiveSource,
  planArchiveReset,
} from "./archive-reset-rules";

const archive = (id: string, tail = id): NewsRow => ({
  id,
  source: `${LEGACY_SOURCE_PREFIX}${tail}`,
});
const manual = (id: string): NewsRow => ({ id, source: null });
const link = (newsId: string, documentId: string): LinkRow => ({ newsId, documentId });

describe("архивная строка отличается по source", () => {
  test("адрес легаси — архивная", () => {
    expect(isArchiveSource("https://www.tennisfed.spb.ru/newsarch_2013.html")).toBe(true);
    expect(isArchiveSource("https://www.tennisfed.spb.ru/2025/0531")).toBe(true);
  });

  test("NULL — заведена руками", () => {
    expect(isArchiveSource(null)).toBe(false);
  });

  test("чужой адрес архивной не считается", () => {
    expect(isArchiveSource("https://spbtennisfed.ru/news/kubok")).toBe(false);
    expect(isArchiveSource("http://www.tennisfed.spb.ru/2025/0531")).toBe(false);
    expect(isArchiveSource("")).toBe(false);
  });
});

describe("отбор строк к удалению", () => {
  test("удаляются только архивные новости, ручные остаются", () => {
    const plan = planArchiveReset({
      news: [archive("a1"), manual("m1"), archive("a2")],
      photos: [],
      documentIds: [],
      links: [],
    });
    expect(plan.newsIds.sort()).toEqual(["a1", "a2"]);
    expect(plan.before.news).toBe(3);
    expect(plan.after.news).toBe(1);
  });

  test("документ только архивных новостей удаляется", () => {
    const plan = planArchiveReset({
      news: [archive("a1"), archive("a2")],
      photos: [],
      documentIds: ["d1"],
      links: [link("a1", "d1"), link("a2", "d1")],
    });
    expect(plan.documentIds).toEqual(["d1"]);
    expect(plan.after.document).toBe(0);
    expect(plan.after.link).toBe(0);
  });

  test("документ, привязанный и к ручной новости, остаётся вместе со своей связью", () => {
    const plan = planArchiveReset({
      news: [archive("a1"), manual("m1")],
      photos: [],
      documentIds: ["d1"],
      links: [link("a1", "d1"), link("m1", "d1")],
    });
    expect(plan.documentIds).toEqual([]);
    expect(plan.after.document).toBe(1);
    // Связь архивной новости уходит каскадом, связь ручной остаётся.
    expect(plan.before.link).toBe(2);
    expect(plan.after.link).toBe(1);
  });

  test("документ без привязок не трогается", () => {
    const plan = planArchiveReset({
      news: [archive("a1")],
      photos: [],
      documentIds: ["d1", "d2"],
      links: [link("a1", "d1")],
    });
    expect(plan.documentIds).toEqual(["d1"]);
    expect(plan.after.document).toBe(1);
  });

  test("связь на неизвестную новость документ сохраняет", () => {
    const plan = planArchiveReset({
      news: [archive("a1")],
      photos: [],
      documentIds: ["d1"],
      links: [link("a1", "d1"), link("неизвестна", "d1")],
    });
    expect(plan.documentIds).toEqual([]);
    expect(plan.after.document).toBe(1);
  });

  test("фото считаются по своей новости", () => {
    const plan = planArchiveReset({
      news: [archive("a1"), manual("m1")],
      photos: [
        { newsId: "a1" },
        { newsId: "a1" },
        { newsId: "a1" },
        { newsId: "m1" },
        { newsId: "m1" },
      ],
      documentIds: [],
      links: [],
    });
    expect(plan.before.photo).toBe(5);
    expect(plan.after.photo).toBe(2);
  });

  test("схема без архива: удалять нечего, счёта не меняются", () => {
    const plan = planArchiveReset({
      news: [manual("m1")],
      photos: [{ newsId: "m1" }],
      documentIds: ["d1"],
      links: [link("m1", "d1")],
    });
    expect(plan.newsIds).toEqual([]);
    expect(plan.documentIds).toEqual([]);
    expect(plan.after).toEqual(plan.before);
  });
});

/**
 * Отказ по хосту проверяется запуском самого скрипта: его контракт — код
 * выхода процесса, а не возвращаемое значение. Строка подключения ведёт на
 * заведомо удалённый хост, поэтому до базы дело не доходит ни при каком
 * исходе — guard стоит раньше подключения. Сообщение обязано называть именно
 * этот хост: так видно, что сработал он, а не `DATABASE_URL` из `.env`.
 */
describe("отказ по хосту", () => {
  const root = path.resolve(import.meta.dir, "..");
  const cli = (env: Record<string, string>, ...args: string[]) => {
    const p = Bun.spawnSync([process.execPath, "scripts/reset-archive.ts", ...args], {
      cwd: root,
      env: { ...process.env, ...env },
    });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };

  test("удалённый хост — отказ с кодом 1, хост назван", () => {
    const r = cli({ DATABASE_URL: "postgresql://u:p@db.example.com:5432/prod" }, "--schema=dev");
    expect(r.code).toBe(1);
    expect(r.err).toContain("Отказ:");
    expect(r.err).toContain("db.example.com");
    // Первая строка вывода называет хост и схему до всякого отказа.
    expect(r.out).toContain("Хост: db.example.com/prod, схема: dev");
  });

  test("удалённый хост — отказ и с --yes", () => {
    const r = cli(
      { DATABASE_URL: "postgresql://u:p@db.example.com:5432/prod" },
      "--schema=public",
      "--yes",
    );
    expect(r.code).toBe(1);
    expect(r.err).toContain("db.example.com");
  });

  test("схема не названа — отказ до проверки хоста", () => {
    const r = cli({ DATABASE_URL: "postgresql://u:p@db.example.com:5432/prod" });
    expect(r.code).toBe(1);
    expect(r.err).toContain("--schema");
  });
});
