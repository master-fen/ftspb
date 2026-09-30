import { describe, expect, test } from "bun:test";
import {
  type DbNews,
  type ExportRecord,
  type RollbackFile,
  type RollbackItem,
  buildChanges,
  checkRollbackTarget,
  classifyState,
  decideObject,
  headerLine,
  isTempPath,
  mayDeleteObject,
  parseCliArgs,
  parseRollbackFile,
  rollbackAction,
} from "./archive-gallery-ops";

const SITE = "https://www.tennisfed.spb.ru";

const rec = (over: Partial<ExportRecord> & { Заголовок: string }): ExportRecord => ({
  Дата: "2006-04-12",
  ТекстHTML: "<p>Текст.</p>",
  Источник: `${SITE}/newsarch_2006.html`,
  ...over,
});

const G = (n: number) => `download\\pic\\gallery\\x\\${String(n).padStart(3, "0")}.jpg`;

/** Прежняя и новая выгрузки: у первой записи дописано два кадра. */
const base: ExportRecord[] = [
  rec({ Заголовок: "А", Обложка: "download\\news\\a.jpg", Галерея: ["download\\news\\a2.jpg"] }),
  rec({ Заголовок: "Б", Дата: "2006-05-01" }),
];
const next: ExportRecord[] = [
  rec({
    Заголовок: "А",
    Обложка: "download\\news\\a.jpg",
    Галерея: ["download\\news\\a2.jpg", G(1), G(2)],
    ТекстHTML: "<p>Текст без ссылки.</p>",
  }),
  rec({ Заголовок: "Б", Дата: "2006-05-01" }),
];

describe("командная строка", () => {
  test("без --schema отказ до всякого подключения", () => {
    const r = parseCliArgs(["--new=n", "--base=b", "--dry-run"], false);
    expect(r).toEqual({ ok: false, error: '--schema обязателен и должен быть "dev" или "public"' });
  });

  test("схема, не равная dev и public, — отказ", () => {
    expect(parseCliArgs(["--schema=prod", "--new=n", "--base=b", "--dry-run"], false).ok).toBe(
      false,
    );
  });

  test("сухой прогон: режим «сухой прогон», --backup не нужен", () => {
    const r = parseCliArgs(["--schema=public", "--new=n", "--base=b", "--dry-run"], false);
    expect(r.ok && r.config.mode).toBe("сухой прогон");
  });

  test("запись без --backup — отказ; с временным каталогом — отказ; с обычным — запись", () => {
    const args = ["--schema=dev", "--new=n", "--base=b"];
    expect(parseCliArgs(args, false).ok).toBe(false);
    expect(
      parseCliArgs([...args, "--backup=C:\\Users\\a\\AppData\\Local\\Temp\\x"], false).ok,
    ).toBe(false);
    const ok = parseCliArgs([...args, "--backup=D:\\Webarchive\\gallery-op"], false);
    expect(ok.ok && ok.config.mode).toBe("запись");
  });

  test("--rollback: режим «откат», --only несовместим, --new и --base не нужны", () => {
    const r = parseCliArgs(["--schema=public", "--rollback=f.json"], false);
    expect(r.ok && r.config.mode).toBe("откат");
    expect(parseCliArgs(["--schema=public", "--rollback=f.json", "--only=x"], false).ok).toBe(
      false,
    );
  });

  test("--stub-s3 допустим только при локальной базе", () => {
    const args = ["--schema=public", "--new=n", "--base=b", "--dry-run", "--stub-s3=D:\\s3"];
    expect(parseCliArgs(args, false)).toEqual({
      ok: false,
      error: "--stub-s3 допустим только при локальной базе (localhost/127.0.0.1)",
    });
    expect(parseCliArgs(args, true).ok).toBe(true);
  });

  test("неизвестный аргумент — отказ", () => {
    expect(parseCliArgs(["--schema=dev", "--force"], false).ok).toBe(false);
  });

  test("первая строка: цель без пароля и режим", () => {
    expect(headerLine("host.timeweb/default_db", "public", "запись")).toBe(
      "Цель: host.timeweb/default_db, schema=public, режим: запись",
    );
  });

  test("временный путь распознаётся, обычный — нет", () => {
    expect(isTempPath("C:\\Users\\anton\\AppData\\Local\\Temp\\claude\\x")).toBe(true);
    expect(isTempPath("/tmp/x")).toBe(true);
    expect(isTempPath("D:\\Webarchive\\gallery-op")).toBe(false);
  });
});

describe("разность выгрузок", () => {
  const slugs = ["a", "b"];

  test("дописанные кадры получают ключи NN после имеющихся, тело — новое", () => {
    const [c] = buildChanges(base, next, slugs, slugs);
    expect(c.slug).toBe("a");
    expect(c.addPhotos.map((p) => [p.key, p.position, p.isCover])).toEqual([
      ["news/a/02.jpg", 2, false],
      ["news/a/03.jpg", 3, false],
    ]);
    expect(c.oldRows).toEqual([
      { key: "news/a/cover.jpg", position: 0 },
      { key: "news/a/01.jpg", position: 1 },
    ]);
    expect(c.newBody).toBe("<p>Текст без ссылки.</p>");
  });

  test("неизменённые записи в план не попадают", () => {
    expect(buildChanges(base, next, slugs, slugs).length).toBe(1);
    expect(buildChanges(base, base, slugs, slugs)).toEqual([]);
  });

  test("адресат без обложки: первый кадр — обложка, cover.ext и position 0", () => {
    const b = [rec({ Заголовок: "В" })];
    const n = [rec({ Заголовок: "В", Обложка: G(1), Галерея: [G(2), G(3)] })];
    const [c] = buildChanges(b, n, ["v"], ["v"]);
    expect(c.addPhotos.map((p) => [p.key, p.position, p.isCover])).toEqual([
      ["news/v/cover.jpg", 0, true],
      ["news/v/01.jpg", 1, false],
      ["news/v/02.jpg", 2, false],
    ]);
    expect(c.oldCoverKey).toBeNull();
    expect(c.newCoverKey).toBe("news/v/cover.jpg");
  });

  test("метка на запись в новом теле разрешается по новому Источнику, в прежнем — нет", () => {
    const b = [
      rec({ Заголовок: "Адресат" }),
      rec({
        Заголовок: "Другая",
        ТекстHTML: `<p><a href="archive-record:${SITE}/photogallery_x.html">Фото</a></p>`,
      }),
    ];
    const n = [
      rec({ Заголовок: "Адресат", Источник: `${SITE}/photogallery_x.html` }),
      rec({
        Заголовок: "Другая",
        ТекстHTML: `<p><a href="archive-record:${SITE}/photogallery_x.html">Фото</a></p>`,
      }),
    ];
    const changes = buildChanges(b, n, ["adresat", "drugaya"], ["adresat", "drugaya"]);
    const other = changes.find((c) => c.slug === "drugaya");
    // тело «Другой» в выгрузках одинаково, поэтому разность видит только Источник адресата,
    // а ссылка «Другой» разрешается в базе иначе: метка → /news/adresat
    expect(other).toBeUndefined();
    const target = changes.find((c) => c.slug === "adresat")!;
    expect(target.oldSource).toBe(`${SITE}/newsarch_2006.html`);
    expect(target.newSource).toBe(`${SITE}/photogallery_x.html`);
  });

  test("изменено поле вне разрешённых — отказ", () => {
    const n = [{ ...next[0], Анонс: "новый" }, next[1]];
    expect(() => buildChanges(base, n, ["a", "b"], ["a", "b"])).toThrow(/вне разрешённых: Анонс/);
  });

  test("галерея изменена не дописыванием — отказ", () => {
    const n = [{ ...next[0], Галерея: [G(1), "download\\news\\a2.jpg"] }, next[1]];
    expect(() => buildChanges(base, n, ["a", "b"], ["a", "b"])).toThrow(/не дописыванием/);
  });

  test("обложка заменена, а не добавлена — отказ", () => {
    const n = [{ ...next[0], Обложка: G(9) }, next[1]];
    expect(() => buildChanges(base, n, ["a", "b"], ["a", "b"])).toThrow(/обложка заменена/);
  });

  test("выгрузки разошлись по слагу — отказ", () => {
    expect(() => buildChanges(base, next, ["a", "b"], ["a", "b-2"])).toThrow(/разошлись/);
  });
});

describe("сверка состояния базы", () => {
  const [change] = buildChanges(base, next, ["a", "b"], ["a", "b"]);
  const dbOld = (): DbNews => ({
    id: "n1",
    slug: "a",
    status: "published",
    deletedAt: null,
    body: change.oldBody,
    source: change.oldSource,
    coverPhotoId: "p0",
    photos: [
      { id: "p0", key: "news/a/cover.jpg", position: 0 },
      { id: "p1", key: "news/a/01.jpg", position: 1 },
    ],
  });
  const dbNew = (): DbNews => ({
    ...dbOld(),
    body: change.newBody,
    source: change.newSource,
    photos: [
      ...dbOld().photos,
      { id: "p2", key: "news/a/02.jpg", position: 2 },
      { id: "p3", key: "news/a/03.jpg", position: 3 },
    ],
  });

  test("прежнее состояние — к записи", () => {
    expect(classifyState(change, dbOld(), 1)).toEqual({ kind: "к записи" });
  });

  test("новое состояние — уже сделано (повторный план)", () => {
    expect(classifyState(change, dbNew(), 1)).toEqual({ kind: "уже сделано" });
  });

  test("тело отличается — расходится, с позицией первого различия", () => {
    const v = classifyState(change, { ...dbOld(), body: "<p>Текст, правка редактора.</p>" }, 1);
    expect(v.kind).toBe("расходится");
    expect(v.kind === "расходится" && v.reasons[0]).toContain("тело ОТЛИЧАЕТСЯ с позиции");
  });

  test("лишнее фото в базе (редактор добавил) — расходится", () => {
    const db = dbOld();
    db.photos = [...db.photos, { id: "px", key: "news/u1.jpg", position: 2 }];
    expect(classifyState(change, db, 1).kind).toBe("расходится");
  });

  test("обложка в базе не та — расходится", () => {
    expect(classifyState(change, { ...dbOld(), coverPhotoId: "p1" }, 1).kind).toBe("расходится");
  });

  test("слаг, статус, мягкое удаление, число строк — расходится", () => {
    expect(classifyState(change, { ...dbOld(), slug: "a-2" }, 1).kind).toBe("расходится");
    expect(classifyState(change, { ...dbOld(), status: "draft" }, 1).kind).toBe("расходится");
    expect(classifyState(change, { ...dbOld(), deletedAt: new Date() }, 1).kind).toBe("расходится");
    expect(classifyState(change, null, 0).kind).toBe("расходится");
    expect(classifyState(change, dbOld(), 2).kind).toBe("расходится");
  });

  test("source в базе не прежний — расходится", () => {
    expect(classifyState(change, { ...dbOld(), source: null }, 1).kind).toBe("расходится");
  });
});

describe("объекты хранилища", () => {
  test("нет объекта — залить и пометить созданным", () => {
    expect(decideObject(null, 100)).toEqual({ action: "залить", created: true });
  });
  test("есть того же размера — уже есть, не наш", () => {
    expect(decideObject({ size: 100 }, 100)).toEqual({ action: "уже есть", created: false });
  });
  test("есть другого размера — стоп, перезаписи нет", () => {
    expect(decideObject({ size: 7 }, 100).action).toBe("стоп");
  });
});

describe("файл отката", () => {
  const item: RollbackItem = {
    id: "n1",
    slug: "a",
    oldBody: "старое",
    newBody: "новое",
    oldSource: "s0",
    newSource: "s1",
    oldCoverPhotoId: null,
    rows: [
      { id: "r1", key: "news/a/02.jpg", position: 2, width: 1, height: 1, isCover: false },
      { id: "r2", key: "news/a/03.jpg", position: 3, width: 1, height: 1, isCover: false },
    ],
    objects: [],
    applied: true,
  };
  const file: RollbackFile = {
    version: 1,
    createdAt: "2026-09-30T12:00:00.000Z",
    target: "host/db",
    schema: "public",
    items: [item],
  };

  test("файл разбирается обратно без потерь", () => {
    expect(parseRollbackFile(JSON.stringify(file))).toEqual(file);
  });

  test("файл с неверной версией или без записей не разбирается", () => {
    expect(() => parseRollbackFile(JSON.stringify({ ...file, version: 2 }))).toThrow();
    expect(() => parseRollbackFile(JSON.stringify({ ...file, items: [{ slug: "a" }] }))).toThrow();
  });

  test("другой хост или другая схема — откат отменён", () => {
    expect(checkRollbackTarget(file, { target: "host/db", schema: "public" })).toBeNull();
    expect(
      checkRollbackTarget(file, { target: "localhost/ftspb_local", schema: "public" }),
    ).toContain("откат отменён");
    expect(checkRollbackTarget(file, { target: "host/db", schema: "dev" })).toContain(
      "откат отменён",
    );
  });

  test("откат: новость в состоянии операции — откатить", () => {
    const db = { body: "новое", source: "s1", presentRowIds: ["r1", "r2"] };
    expect(rollbackAction(item, db)).toEqual({ kind: "откатить" });
  });

  test("откат: уже откачено; тело правили после операции — расходится", () => {
    expect(rollbackAction(item, { body: "старое", source: "s0", presentRowIds: [] })).toEqual({
      kind: "уже откачено",
    });
    const v = rollbackAction(item, { body: "правка", source: "s1", presentRowIds: ["r1", "r2"] });
    expect(v).toEqual({ kind: "расходится", reason: "тело после операции правили" });
    expect(rollbackAction(item, null).kind).toBe("расходится");
  });

  test("откат: строк операции в базе меньше — расходится", () => {
    const v = rollbackAction(item, { body: "новое", source: "s1", presentRowIds: ["r1"] });
    expect(v.kind).toBe("расходится");
  });

  const remote = { etag: "abc", size: 10 };
  const ok = { created: true, fileEtag: "abc", fileSize: 10, remote, referencedByRows: 0 };

  test("удаление объекта: создан операцией, ETag и размер равны, ссылок нет", () => {
    expect(mayDeleteObject(ok).delete).toBe(true);
  });

  test("удаление объекта: каждое условие по отдельности запрещает", () => {
    expect(mayDeleteObject({ ...ok, created: false }).delete).toBe(false);
    expect(mayDeleteObject({ ...ok, remote: null }).delete).toBe(false);
    expect(mayDeleteObject({ ...ok, fileEtag: null }).delete).toBe(false);
    expect(mayDeleteObject({ ...ok, remote: { etag: "zzz", size: 10 } }).delete).toBe(false);
    expect(mayDeleteObject({ ...ok, remote: { etag: "abc", size: 11 } }).delete).toBe(false);
    expect(mayDeleteObject({ ...ok, referencedByRows: 1 }).delete).toBe(false);
  });
});
