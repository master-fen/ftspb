import path from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import { isS3NotFound } from "../src/server/storage";
import {
  CREATED_AT_STEP_MS,
  MAX_RECORDS_PER_DAY,
  type ExistingNewsRow,
  type PlanIdentity,
  checkFailInjection,
  checkReplaceAllCoverage,
  createdAtByIndex,
  createdAtForRank,
  decideAddOnly,
  decideUpload,
  documentMimeType,
  imageContentType,
  indexByTitleDate,
  partitionAddOnly,
  resolveSlugs,
  syntheticDatabaseBreak,
  syntheticStorageBreak,
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
      plan("a", "Первая", "2024-03-01"),
      plan("est-1", "Уже есть", "2024-01-01"),
      plan("b", "Вторая", "2024-03-02"),
      plan("est-2", "Мягко удалена", "2024-01-02"),
      plan("c", "Третья", "2024-03-03"),
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

  test("новость под слагом, который занимает сама выгрузка, версией сайта не считается", () => {
    // След прошлого прогона архива: та же пара «заголовок + дата», но слаг —
    // из выгрузки. Пропускать по ней нельзя, иначе запись потерялась бы.
    const prev = [row("match-gorodov", "Матч городов", "2026-05-11")];
    const idx = indexByTitleDate(prev, new Set(["match-gorodov"]));
    expect(idx.size).toBe(0);
    const got = partitionAddOnly(
      [plan("match-gorodov-2", "Матч городов", "2026-05-11")],
      new Map(prev.map((r) => [r.slug, r])),
      idx,
    );
    expect(got.insert.map((x) => x.slug)).toEqual(["match-gorodov-2"]);
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

describe("тип содержимого по расширению", () => {
  test("кадры: четыре расширения архива", () => {
    expect(imageContentType(".jpg", "тест")).toBe("image/jpeg");
    expect(imageContentType(".jpeg", "тест")).toBe("image/jpeg");
    expect(imageContentType(".png", "тест")).toBe("image/png");
    expect(imageContentType(".webp", "тест")).toBe("image/webp");
    expect(imageContentType(".gif", "тест")).toBe("image/gif");
  });

  test("кадр с неизвестным расширением роняет сборку плана, а не уезжает в бакет", () => {
    expect(() => imageContentType(".bmp", "обложка новости «Х»")).toThrow(
      'Неизвестное расширение изображения ".bmp" (обложка новости «Х»)',
    );
  });

  test("регистр не подставляется сам: вызывающий приводит расширение к нижнему", () => {
    // buildPlan делает toLowerCase() до вызова; правило про это не знает и
    // обязано отказать, иначе ошибка вызывающего стала бы молчаливой.
    expect(() => imageContentType(".JPG", "тест")).toThrow("Неизвестное расширение");
  });

  test("документы: одиннадцать расширений архива", () => {
    const expected: Array<[string, string]> = [
      [".pdf", "application/pdf"],
      [".doc", "application/msword"],
      [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      [".xls", "application/vnd.ms-excel"],
      [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      [".rtf", "application/rtf"],
      [".zip", "application/zip"],
      [".rar", "application/x-rar-compressed"],
      [".mp4", "video/mp4"],
      [".mov", "video/quicktime"],
    ];
    expect(expected.map(([ext]) => documentMimeType(ext, "тест"))).toEqual(
      expected.map(([, mime]) => mime),
    );
  });

  test("документ с неизвестным расширением — отказ с именем расширения", () => {
    expect(() => documentMimeType(".odt", "документ новости «Х»")).toThrow(
      'Неизвестное расширение документа ".odt" (документ новости «Х»)',
    );
  });
});

describe("искусственные ошибки обрыва", () => {
  test("ошибка хранилища: сетевой код, счёт попыток, метка synthetic", () => {
    const error = syntheticStorageBreak("news/kubok/03.jpg");
    expect(error.code).toBe("ECONNREFUSED");
    expect(error.$metadata).toEqual({ attempts: 3 });
    expect(error.synthetic).toBe(true);
    expect(error.message).toContain("news/kubok/03.jpg");
    expect(error.message).toContain("--fail-after-objects");
  });

  test("кода ответа нет — настоящая isS3NotFound за 404 её не принимает", () => {
    // Сверка с боевой функцией, а не с её пересказом: если у ошибки появится
    // `$metadata.httpStatusCode: 404`, обрыв превратится в «объекта нет» и
    // заливка молча пойдёт дальше.
    expect(isS3NotFound(syntheticStorageBreak("news/kubok/03.jpg"))).toBe(false);
    // Положительный контроль самой проверки.
    expect(isS3NotFound({ $metadata: { httpStatusCode: 404 } })).toBe(true);
  });

  test("ошибка базы называет слаг и ключ", () => {
    const error = syntheticDatabaseBreak("kubok-severnoy-stolitsy");
    expect(error.message).toContain("kubok-severnoy-stolitsy");
    expect(error.message).toContain("--fail-after-records");
  });
});

const REMOTE = "postgresql://u:p@db.example.com:5432/prod";
const LOCAL = "postgresql://postgres:p@localhost:5432/ftspb_local";

describe("ключи обрыва: где разрешены", () => {
  test("ключей нет — можно при любом хосте", () => {
    // Отрицательный контроль всей затеи: обычный прогон, в том числе боевой,
    // этого предохранителя не видит вовсе.
    expect(checkFailInjection({}, REMOTE)).toEqual({ ok: true });
    expect(checkFailInjection({}, undefined)).toEqual({ ok: true });
  });

  test("localhost и 127.0.0.1 — можно", () => {
    expect(checkFailInjection({ afterObjects: 4000 }, LOCAL).ok).toBe(true);
    expect(checkFailInjection({ afterRecords: 5 }, "postgresql://u:p@127.0.0.1:5432/db").ok).toBe(
      true,
    );
  });

  test("ноль — законное значение ключа, а не «ключа нет»", () => {
    const verdict = checkFailInjection({ afterObjects: 0 }, REMOTE);
    expect(verdict.ok).toBe(false);
  });

  test("удалённый хост — отказ, хост и ключ названы", () => {
    const verdict = checkFailInjection({ afterObjects: 4000 }, REMOTE);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("ожидался отказ");
    expect(verdict.message).toContain("db.example.com");
    expect(verdict.message).toContain("ключ --fail-after-objects");
    expect(verdict.message).not.toContain("ключи");
  });

  test("два ключа разом — во множественном числе и оба поимённо", () => {
    const verdict = checkFailInjection({ afterObjects: 1, afterRecords: 2 }, REMOTE);
    if (verdict.ok) throw new Error("ожидался отказ");
    expect(verdict.message).toContain("ключи --fail-after-objects, --fail-after-records");
  });

  test("DATABASE_URL не задан — отказ", () => {
    const verdict = checkFailInjection({ afterRecords: 5 }, undefined);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("ожидался отказ");
    expect(verdict.message).toContain("DATABASE_URL не задан");
  });

  test("DATABASE_URL не разбирается — отказ, а не исключение", () => {
    const verdict = checkFailInjection({ afterObjects: 1 }, "это не строка подключения");
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("ожидался отказ");
    expect(verdict.message).toContain("не разбирается");
  });
});

/**
 * Контракт предохранителя — код выхода процесса, поэтому он проверяется
 * запуском самого мигратора, как у reset-archive. Строка подключения ведёт на
 * заведомо удалённый хост, а `--source` указывает в несуществующий каталог:
 * если отказ не сработает, прогон споткнётся о чтение файла — и это видно по
 * отсутствию слова «Отказ» в последнем тесте.
 */
describe("мигратор: отказ ключу обрыва по хосту", () => {
  const root = path.resolve(import.meta.dir, "..");
  const cli = (env: Record<string, string>, ...args: string[]) => {
    const p = Bun.spawnSync([process.execPath, "scripts/migrate-archive.ts", ...args], {
      cwd: root,
      env: { ...process.env, ...env },
    });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };
  const remote = { DATABASE_URL: REMOTE };
  const nowhere = "--source=C:/такого/каталога/нет";

  test("--fail-after-objects на удалённом хосте — код 1, хост назван, строка хоста напечатана", () => {
    const r = cli(remote, nowhere, "--schema=dev", "--add-only", "--fail-after-objects=5");
    expect(r.code).toBe(1);
    expect(r.err).toContain("Отказ:");
    expect(r.err).toContain("db.example.com");
    expect(r.out).toContain("Хост: db.example.com/prod");
  });

  test("--fail-after-records на удалённом хосте — код 1", () => {
    const r = cli(remote, nowhere, "--schema=dev", "--add-only", "--fail-after-records=5");
    expect(r.code).toBe(1);
    expect(r.err).toContain("Отказ:");
    expect(r.err).toContain("--fail-after-records");
  });

  test("ключ обрыва вместе с --dry-run — отказ разбора аргументов, до строки хоста", () => {
    const r = cli(
      remote,
      nowhere,
      "--schema=dev",
      "--add-only",
      "--dry-run",
      "--fail-after-objects=5",
    );
    expect(r.code).toBe(1);
    expect(r.err).toContain("сухому рвать нечего");
    expect(r.out).not.toContain("Хост:");
  });

  test("нечисловое значение ключа — отказ разбора аргументов", () => {
    const r = cli(remote, nowhere, "--schema=dev", "--add-only", "--fail-after-objects=abc");
    expect(r.code).toBe(1);
    expect(r.err).toContain("--fail-after-objects должен быть целым неотрицательным числом");
    expect(r.out).not.toContain("Хост:");
  });

  test("оба ключа разом — отказ разбора аргументов", () => {
    const r = cli(
      remote,
      nowhere,
      "--schema=dev",
      "--add-only",
      "--fail-after-objects=1",
      "--fail-after-records=1",
    );
    expect(r.code).toBe(1);
    expect(r.err).toContain("несовместимы");
  });

  test("без ключей обрыва предохранитель молчит на том же удалённом хосте", () => {
    // Отрицательный контроль: код выхода 1 приходит от чтения выгрузки, а не
    // от предохранителя, — иначе первые тесты этого блока проходили бы всегда.
    const r = cli(remote, nowhere, "--schema=dev", "--add-only");
    expect(r.code).toBe(1);
    expect(r.err).not.toContain("Отказ:");
    expect(r.out).toContain("Хост: db.example.com/prod");
  });
});
