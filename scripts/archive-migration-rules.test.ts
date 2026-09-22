import { describe, expect, test } from "bun:test";
import {
  CREATED_AT_STEP_MS,
  MAX_RECORDS_PER_DAY,
  type ExistingNewsRow,
  type PlanIdentity,
  checkReplaceAllCoverage,
  createdAtByIndex,
  createdAtForRank,
  decideAddOnly,
  decideUpload,
  indexByTitleDate,
  partitionAddOnly,
  resolveSlugs,
  titleDateOverlap,
} from "./archive-migration-rules";

const row = (
  slug: string,
  title: string,
  publishedAt: string,
  deletedAt: Date | string | null = null,
): ExistingNewsRow => ({ slug, title, publishedAt, deletedAt });

const plan = (slug: string, title: string, publishedAt: string): PlanIdentity => ({
  slug,
  title,
  publishedAt,
});

/** Лента: published_at desc, created_at desc, id desc (src/server/news.ts). */
function feedOrder(items: Array<{ i: number; date: string; createdAt: Date }>): number[] {
  return [...items]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime() || b.i - a.i,
    )
    .map((x) => x.i);
}

describe("created_at: порядок внутри дня повторяет ленту легаси", () => {
  test("первая запись дня получает ровно полдень UTC", () => {
    expect(createdAtForRank("2024-06-05", 0).toISOString()).toBe("2024-06-05T12:00:00.000Z");
  });

  test("вторая запись дня получает отметку на шаг раньше", () => {
    const first = createdAtForRank("2024-06-05", 0).getTime();
    const second = createdAtForRank("2024-06-05", 1).getTime();
    expect(first - second).toBe(CREATED_AT_STEP_MS);
  });

  test("единственная запись дня получает базовую отметку", () => {
    expect(createdAtByIndex(["2024-06-05"])[0].toISOString()).toBe("2024-06-05T12:00:00.000Z");
  });

  test("отметка собрана в UTC и не зависит от пояса машины", () => {
    const d = createdAtForRank("2024-06-05", 0);
    expect(d.getTime()).toBe(Date.UTC(2024, 5, 5, 12, 0, 0, 0));
  });

  test("ранг считается внутри дня: соседние дни друг на друга не влияют", () => {
    const got = createdAtByIndex(["2024-06-06", "2024-06-05", "2024-06-05"]);
    expect(got[0].toISOString()).toBe("2024-06-06T12:00:00.000Z");
    expect(got[1].toISOString()).toBe("2024-06-05T12:00:00.000Z");
    expect(got[2].toISOString()).toBe("2024-06-05T11:59:59.000Z");
  });

  test("сортировка ленты восстанавливает порядок массива выгрузки", () => {
    const dates = [
      "2024-06-06",
      "2024-06-05",
      "2024-06-05",
      "2024-06-05",
      "2024-06-04",
      "2024-06-04",
    ];
    const created = createdAtByIndex(dates);
    const items = dates.map((date, i) => ({ i, date, createdAt: created[i] }));
    expect(feedOrder(items)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("обратный знак шага дал бы обратный порядок внутри дня — контроль формулы", () => {
    const dates = ["2024-06-05", "2024-06-05", "2024-06-05"];
    const base = Date.parse("2024-06-05T12:00:00.000Z");
    const wrong = dates.map((date, i) => ({
      i,
      date,
      createdAt: new Date(base + i * CREATED_AT_STEP_MS),
    }));
    expect(feedOrder(wrong)).toEqual([2, 1, 0]);

    const right = createdAtByIndex(dates);
    expect(feedOrder(dates.map((date, i) => ({ i, date, createdAt: right[i] })))).toEqual([
      0, 1, 2,
    ]);
  });

  test("префиксный срез даёт те же отметки, что полный прогон", () => {
    const dates = ["2024-06-06", "2024-06-05", "2024-06-05", "2024-06-05"];
    const full = createdAtByIndex(dates).map((d) => d.toISOString());
    const sliced = createdAtByIndex(dates.slice(0, 3)).map((d) => d.toISOString());
    expect(sliced).toEqual(full.slice(0, 3));
  });

  test("запись смежной ленты в хвосте массива встаёт ниже записи годовой ленты того же дня", () => {
    // Записи смежных лент дописываются в конец массива (parse-archive.ts),
    // поэтому за общий день они получают более раннюю отметку.
    const dates = ["2023-06-26", "2024-01-01", "2023-06-26"];
    const created = createdAtByIndex(dates);
    expect(created[2].getTime()).toBeLessThan(created[0].getTime());
    const items = dates.map((date, i) => ({ i, date, createdAt: created[i] }));
    expect(feedOrder(items)).toEqual([1, 0, 2]);
  });

  test("ранг за пределом суток — исключение, а не отметка предыдущего дня", () => {
    expect(() => createdAtForRank("2024-06-05", MAX_RECORDS_PER_DAY)).toThrow(/за пределом суток/);
  });

  test("некорректная дата — исключение", () => {
    expect(() => createdAtForRank("2024-6-5", 0)).toThrow(/некорректная дата/);
    expect(() => createdAtForRank("", 0)).toThrow(/некорректная дата/);
    expect(() => createdAtForRank("2024-06-05T10:00", 0)).toThrow(/некорректная дата/);
    expect(() => createdAtForRank("2024-02-30", 0)).toThrow(/некорректная дата/);
  });
});

describe("только добавить: что пропускается", () => {
  const existing = new Map([
    ["est-1", row("est-1", "Уже есть", "2024-01-01")],
    ["est-2", row("est-2", "Мягко удалена", "2024-01-02", new Date("2026-01-01T00:00:00.000Z"))],
    ["est-3", row("est-3", "Черновик", "2024-01-03")],
  ]);

  test("слага нет в схеме — вставляем", () => {
    expect(decideAddOnly("net-takogo", existing)).toEqual({ action: "insert" });
  });

  test("слаг есть, новость живая — пропуск с причиной active", () => {
    expect(decideAddOnly("est-1", existing)).toEqual({ action: "skip", reason: "active" });
  });

  test("слаг есть, новость мягко удалена — пропуск, а не воскрешение", () => {
    expect(decideAddOnly("est-2", existing)).toEqual({ action: "skip", reason: "soft-deleted" });
  });

  test("черновик с тем же слагом тоже пропускается", () => {
    // Строка читается без фильтра по статусу: уникальность слага общая.
    expect(decideAddOnly("est-3", existing)).toEqual({ action: "skip", reason: "active" });
  });

  test("порядок выгрузки сохраняется в обоих списках", () => {
    const items = [
      { slug: "a" },
      { slug: "est-1" },
      { slug: "b" },
      { slug: "est-2" },
      { slug: "c" },
    ];
    const got = partitionAddOnly(items, existing);
    expect(got.insert.map((x) => x.slug)).toEqual(["a", "b", "c"]);
    expect(got.skipped.map((x) => x.item.slug)).toEqual(["est-1", "est-2"]);
    expect(got.skipped.map((x) => x.reason)).toEqual(["active", "soft-deleted"]);
  });

  test("совпадение по заголовку и дате под другим слагом вставке не мешает, но видно в справке", () => {
    const ex = [row("ruchnaya", "Матч городов", "2026-05-11")];
    const plans = [plan("match-gorodov", "Матч городов", "2026-05-11")];
    const bySlug = new Map(ex.map((r) => [r.slug, r]));
    expect(decideAddOnly("match-gorodov", bySlug)).toEqual({ action: "insert" });
    const overlap = titleDateOverlap(ex, plans);
    expect(overlap).toHaveLength(1);
    expect(overlap[0].existing.slug).toBe("ruchnaya");
    expect(overlap[0].planSlug).toBe("match-gorodov");
    expect(overlap[0].planTitle).toBe("Матч городов");
  });

  test("лишние пробелы в заголовке справке не мешают", () => {
    const ex = [row("ruchnaya", "  Матч   городов ", "2026-05-11")];
    const plans = [plan("match-gorodov", "Матч городов", "2026-05-11")];
    expect(titleDateOverlap(ex, plans)).toHaveLength(1);
  });

  test("та же дата, другой заголовок — в справку не попадает", () => {
    const ex = [row("ruchnaya", "Совсем другое", "2026-05-11")];
    const plans = [plan("match-gorodov", "Матч городов", "2026-05-11")];
    expect(titleDateOverlap(ex, plans)).toEqual([]);
  });
});

describe("пропуск совпадений «заголовок + дата» (--skip-title-date)", () => {
  // Решение Антона 21.09.2026: если на сайте уже есть новость с тем же
  // заголовком и датой под другим слагом, оставляется версия сайта.
  const site = [
    row("ruchnaya", "Матч городов", "2026-05-11"),
    row("udalyonnaya", "Стёртая руками", "2026-05-12", new Date("2026-06-01T00:00:00.000Z")),
    row("est-1", "Уже есть", "2024-01-01"),
  ];
  const bySlug = new Map(site.map((r) => [r.slug, r]));
  const byTitleDate = indexByTitleDate(site);

  test("совпадение по заголовку и дате под другим слагом — запись пропускается целиком", () => {
    const got = partitionAddOnly(
      [plan("match-gorodov", "Матч городов", "2026-05-11")],
      bySlug,
      byTitleDate,
    );
    expect(got.insert).toEqual([]);
    expect(got.skipped).toHaveLength(1);
    expect(got.skipped[0].reason).toBe("title-date");
    expect(got.skipped[0].existing?.slug).toBe("ruchnaya");
  });

  test("несовпадение по дате — запись добавляется", () => {
    const got = partitionAddOnly(
      [plan("match-gorodov", "Матч городов", "2026-05-12")],
      bySlug,
      byTitleDate,
    );
    expect(got.insert.map((x) => x.slug)).toEqual(["match-gorodov"]);
    expect(got.skipped).toEqual([]);
  });

  test("та же дата, другой заголовок — запись добавляется", () => {
    const got = partitionAddOnly(
      [plan("drugoe", "Совсем другое", "2026-05-11")],
      bySlug,
      byTitleDate,
    );
    expect(got.insert.map((x) => x.slug)).toEqual(["drugoe"]);
    expect(got.skipped).toEqual([]);
  });

  test("регистр и лишние пробелы в заголовке совпадению не мешают", () => {
    const got = partitionAddOnly(
      [plan("match-gorodov", "  МАТЧ   ГОРОДОВ ", "2026-05-11")],
      bySlug,
      byTitleDate,
    );
    expect(got.skipped.map((x) => x.reason)).toEqual(["title-date"]);
  });

  test("без ключа (карта не передана) та же запись добавляется", () => {
    const got = partitionAddOnly([plan("match-gorodov", "Матч городов", "2026-05-11")], bySlug);
    expect(got.insert.map((x) => x.slug)).toEqual(["match-gorodov"]);
    expect(got.skipped).toEqual([]);
  });

  test("мягко удалённая новость сайта совпадением не считается", () => {
    // Версии сайта у такой пары нет: человек её стёр. Архивную оставляем.
    const got = partitionAddOnly(
      [plan("styortaya", "Стёртая руками", "2026-05-12")],
      bySlug,
      byTitleDate,
    );
    expect(got.insert.map((x) => x.slug)).toEqual(["styortaya"]);
  });

  test("совпадение по слагу сильнее: причина остаётся active", () => {
    const got = partitionAddOnly([plan("est-1", "Уже есть", "2024-01-01")], bySlug, byTitleDate);
    expect(got.skipped.map((x) => x.reason)).toEqual(["active"]);
  });

  test("порядок выгрузки сохраняется в обоих списках", () => {
    const items = [
      plan("a", "Первая", "2024-02-01"),
      plan("match-gorodov", "Матч городов", "2026-05-11"),
      plan("b", "Вторая", "2024-02-02"),
      plan("est-1", "Уже есть", "2024-01-01"),
    ];
    const got = partitionAddOnly(items, bySlug, byTitleDate);
    expect(got.insert.map((x) => x.slug)).toEqual(["a", "b"]);
    expect(got.skipped.map((x) => x.item.slug)).toEqual(["match-gorodov", "est-1"]);
    expect(got.skipped.map((x) => x.reason)).toEqual(["title-date", "active"]);
  });
});

describe("предохранитель --replace-all", () => {
  const plans = [plan("a", "Первая", "2024-01-01"), plan("b", "Вторая", "2024-01-02")];
  const covered = plans.map((p) => row(p.slug, p.title, p.publishedAt));

  test("экспорт покрывает схему по слагам — ok, списки пусты", () => {
    const got = checkReplaceAllCoverage(covered, plans, false);
    expect(got).toEqual({ ok: true, missingBySlug: [], missingByTitleDate: [], bypassed: false });
  });

  test("новость вне экспорта по слагу — отказ, слаг в списке", () => {
    const extra = row("ruchnaya-2026", "Новость редактора", "2026-03-01");
    const got = checkReplaceAllCoverage([...covered, extra], plans, false);
    expect(got.ok).toBe(false);
    expect(got.bypassed).toBe(false);
    expect(got.missingBySlug.map((r) => r.slug)).toEqual(["ruchnaya-2026"]);
  });

  test("мягко удалённая новость вне экспорта — тоже потеря", () => {
    const extra = row("udalena", "Удалена", "2026-03-01", "2026-04-01T00:00:00.000Z");
    const got = checkReplaceAllCoverage([extra], plans, false);
    expect(got.ok).toBe(false);
    expect(got.missingBySlug.map((r) => r.slug)).toEqual(["udalena"]);
  });

  test("критерий «заголовок + дата» промолчал бы, а слаг срабатывает", () => {
    // Новость заведена руками под своим слагом, заголовок и дата — как в выгрузке.
    const ruchnaya = row("ruchnaya-match", "Первая", "2024-01-01");
    const got = checkReplaceAllCoverage([ruchnaya], plans, false);
    expect(got.ok).toBe(false);
    expect(got.missingBySlug.map((r) => r.slug)).toEqual(["ruchnaya-match"]);
    expect(got.missingByTitleDate).toEqual([]);
  });

  test("заголовок поправлен руками: по слагу покрыта, видна только в справке", () => {
    const edited = row("a", "Первая (поправлено)", "2024-01-01");
    const got = checkReplaceAllCoverage([edited], plans, false);
    expect(got.ok).toBe(true);
    expect(got.missingBySlug).toEqual([]);
    expect(got.missingByTitleDate.map((r) => r.slug)).toEqual(["a"]);
  });

  test("--allow-data-loss: ok, но список непуст и отмечено bypassed", () => {
    const extra = row("ruchnaya-2026", "Новость редактора", "2026-03-01");
    const got = checkReplaceAllCoverage([extra], plans, true);
    expect(got.ok).toBe(true);
    expect(got.bypassed).toBe(true);
    expect(got.missingBySlug.map((r) => r.slug)).toEqual(["ruchnaya-2026"]);
  });

  test("пустая схема — ok, bypassed не выставлен", () => {
    const got = checkReplaceAllCoverage([], plans, false);
    expect(got.ok).toBe(true);
    expect(got.bypassed).toBe(false);
  });
});

describe("пропуск уже залитых файлов", () => {
  test("ключ выключен — заливаем, даже если объект есть и размер совпал", () => {
    expect(decideUpload({ skipUploaded: false, remote: { size: 100 }, localSize: 100 })).toBe(
      "upload",
    );
  });

  test("объекта нет — заливаем", () => {
    expect(decideUpload({ skipUploaded: true, remote: null, localSize: 100 })).toBe("upload");
  });

  test("объект есть, размер совпал — пропускаем", () => {
    expect(decideUpload({ skipUploaded: true, remote: { size: 100 }, localSize: 100 })).toBe(
      "skip",
    );
  });

  test("объект есть, размер другой — перезаливаем и говорим об этом отдельно", () => {
    expect(decideUpload({ skipUploaded: true, remote: { size: 40 }, localSize: 100 })).toBe(
      "reupload-size-mismatch",
    );
  });

  test("нулевой размер в бакете не считается совпадением с непустым файлом", () => {
    expect(decideUpload({ skipUploaded: true, remote: { size: 0 }, localSize: 100 })).toBe(
      "reupload-size-mismatch",
    );
  });
});

describe("слаги: срез не меняет результат", () => {
  test("слаги префикса равны префиксу слагов полного списка", () => {
    const records = [
      { Заголовок: "Первая новость", Дата: "2024-01-01" },
      { Заголовок: "Вторая новость", Дата: "2024-01-02" },
      { Заголовок: "Третья новость", Дата: "2024-01-03" },
    ];
    expect(resolveSlugs(records.slice(0, 2))).toEqual(resolveSlugs(records).slice(0, 2));
  });

  test("коллизия за пределом среза даёт датный суффикс и внутри среза", () => {
    const records = [
      { Заголовок: "Матч городов", Дата: "2024-01-01" },
      { Заголовок: "Другая", Дата: "2024-02-02" },
      { Заголовок: "Матч городов", Дата: "2024-03-03" },
    ];
    const full = resolveSlugs(records);
    expect(full[0]).toBe("match-gorodov-2024-01-01");
    expect(full[2]).toBe("match-gorodov-2024-03-03");
    // Срез из двух записей коллизии не видит — поэтому слаги считаются по
    // полному списку, а рабочим берётся префикс.
    expect(resolveSlugs(records.slice(0, 2))[0]).toBe("match-gorodov");
  });
});
