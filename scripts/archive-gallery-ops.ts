/**
 * Чистая логика операции «добавить кадры галерей к существующим новостям» —
 * без базы, без хранилища, без диска (как `archive-migration-rules.ts`).
 * Потребитель один — `scripts/add-gallery-frames.ts` под bun.
 *
 * Операция — это разность двух выгрузок: прежней (с которой залит боевой сайт)
 * и новой (после разбора с `LINKED_GALLERIES`). Что изменилось у записи, то и
 * делается на сайте: дописываются фото, правится тело, у двух записей —
 * `Источник`. Ничего сверх этого операция не умеет и не трогает.
 */
import { newsFileHref } from "../src/lib/news-file-url";
import {
  documentHrefsByPath,
  replaceDocumentMarkers,
  replaceMarkers,
  slugMapBySource,
} from "./archive-markers";

// ───────────────────────── аргументы ─────────────────────────

export type Mode = "сухой прогон" | "запись" | "откат";

export type CliConfig = {
  schema: "dev" | "public";
  mode: Mode;
  /** Откат тоже понимает --dry-run: ничего не пишет, печатает, что сделал бы. */
  dryRun: boolean;
  only: string | undefined;
  newDir: string;
  baseDir: string;
  backupDir: string | undefined;
  rollbackFile: string | undefined;
  stubS3Dir: string | undefined;
};

export type CliResult = { ok: true; config: CliConfig } | { ok: false; error: string };

/**
 * Разбор командной строки до всякого подключения. `--schema` обязателен и
 * явен: молчаливой схемы по умолчанию нет — операция над боевой базой не
 * должна выбирать цель за человека. `--stub-s3` (заглушка хранилища для
 * репетиции) допустим только при локальной базе: на боевую строку он не
 * действует, чтобы «репетиция» не сделала вид, что писала в бакет.
 */
export function parseCliArgs(argv: ReadonlyArray<string>, databaseUrlIsLocal: boolean): CliResult {
  let schema: string | undefined;
  let dryRun = false;
  let only: string | undefined;
  let newDir: string | undefined;
  let baseDir: string | undefined;
  let backupDir: string | undefined;
  let rollbackFile: string | undefined;
  let stubS3Dir: string | undefined;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--schema=")) schema = arg.slice("--schema=".length);
    else if (arg.startsWith("--only=")) only = arg.slice("--only=".length);
    else if (arg.startsWith("--new=")) newDir = arg.slice("--new=".length);
    else if (arg.startsWith("--base=")) baseDir = arg.slice("--base=".length);
    else if (arg.startsWith("--backup=")) backupDir = arg.slice("--backup=".length);
    else if (arg.startsWith("--rollback=")) rollbackFile = arg.slice("--rollback=".length);
    else if (arg.startsWith("--stub-s3=")) stubS3Dir = arg.slice("--stub-s3=".length);
    else return { ok: false, error: `Неизвестный аргумент: ${arg}` };
  }
  if (schema !== "dev" && schema !== "public") {
    return { ok: false, error: '--schema обязателен и должен быть "dev" или "public"' };
  }
  if (stubS3Dir !== undefined && !databaseUrlIsLocal) {
    return {
      ok: false,
      error: "--stub-s3 допустим только при локальной базе (localhost/127.0.0.1)",
    };
  }
  if (rollbackFile !== undefined) {
    if (only !== undefined) return { ok: false, error: "--only и --rollback несовместимы" };
    return {
      ok: true,
      config: {
        schema,
        mode: "откат",
        dryRun,
        only,
        newDir: newDir ?? "",
        baseDir: baseDir ?? "",
        backupDir,
        rollbackFile,
        stubS3Dir,
      },
    };
  }
  if (!newDir)
    return { ok: false, error: "--new=ПАПКА обязателен (сжатая выгрузка после разбора)" };
  if (!baseDir)
    return { ok: false, error: "--base=ПАПКА обязателен (сжатая выгрузка, с которой залит сайт)" };
  if (!dryRun) {
    if (!backupDir)
      return { ok: false, error: "--backup=ПАПКА обязателен для записи (там ляжет файл отката)" };
    if (isTempPath(backupDir)) {
      return { ok: false, error: `--backup указывает во временный каталог: ${backupDir}` };
    }
  }
  return {
    ok: true,
    config: {
      schema,
      mode: dryRun ? "сухой прогон" : "запись",
      dryRun,
      only,
      newDir,
      baseDir,
      backupDir,
      rollbackFile: undefined,
      stubS3Dir,
    },
  };
}

/** Файл отката не должен лежать там, откуда система его выметет. */
export function isTempPath(p: string): boolean {
  const n = p.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)temp(\/|$)/.test(n) || n.startsWith("/tmp/") || n.includes("/appdata/local/temp");
}

/** Первая строка вывода: цель и режим, без логина и пароля. */
export function headerLine(target: string, schema: string, mode: Mode): string {
  return `Цель: ${target}, schema=${schema}, режим: ${mode}`;
}

// ───────────────────────── разность выгрузок → изменения ─────────────────────────

export type ExportRecord = {
  Заголовок: string;
  Дата: string;
  ТекстHTML?: string;
  Обложка?: string;
  Галерея?: string[];
  Документы?: string[];
  Источник?: string;
  [key: string]: unknown;
};

/** Поля, которые операция вправе менять. Разница в любом другом — отказ. */
const CHANGEABLE = new Set(["ТекстHTML", "Обложка", "Галерея", "Источник"]);

export type PhotoPlan = {
  key: string;
  position: number;
  isCover: boolean;
  /** Путь в выгрузке (`download\…`), от корня папки `--new`. */
  exportPath: string;
};

export type NewsChange = {
  index: number;
  slug: string;
  title: string;
  date: string;
  oldBody: string;
  newBody: string;
  oldSource: string | null;
  newSource: string | null;
  /** Фото, которые дописываются; обложка (если она новая) — первой. */
  addPhotos: PhotoPlan[];
  /** Строки `news_photo` до операции по прежней выгрузке: ключ и position. */
  oldRows: Array<{ key: string; position: number }>;
  oldCoverKey: string | null;
  newCoverKey: string | null;
};

const extOf = (p: string): string => {
  const name = p.slice(Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
};

const nn = (n: number): string => String(n).padStart(2, "0");

/** Ключи и position строк по выгрузке — ровно как их раскладывает мигратор. */
export function rowsOfRecord(
  slug: string,
  rec: Pick<ExportRecord, "Обложка" | "Галерея">,
): { rows: Array<{ key: string; position: number }>; coverKey: string | null } {
  const rows: Array<{ key: string; position: number }> = [];
  let coverKey: string | null = null;
  if (rec["Обложка"]) {
    coverKey = `news/${slug}/cover${extOf(rec["Обложка"])}`;
    rows.push({ key: coverKey, position: 0 });
  }
  (rec["Галерея"] ?? []).forEach((g, i) => {
    rows.push({ key: `news/${slug}/${nn(i + 1)}${extOf(g)}`, position: i + 1 });
  });
  return { rows, coverKey };
}

/** Тело как оно лежит в базе: метки записей и документов заменены тем же кодом, что у мигратора. */
export function bodyInDatabase(
  rec: ExportRecord,
  slug: string,
  slugBySource: ReadonlyMap<string, string>,
): string {
  let body = rec["ТекстHTML"] ?? "";
  body = replaceMarkers(body, slugBySource).html;
  body = replaceDocumentMarkers(
    body,
    documentHrefsByPath(rec["Документы"] ?? [], (fileName) => newsFileHref(slug, fileName)),
  ).html;
  return body;
}

/**
 * Разность двух выгрузок → список изменений. Ошибка (бросок) — если записи
 * разошлись по составу или порядку, если изменилось поле вне разрешённых,
 * если галерея изменилась не дописыванием или обложка сменилась, а не
 * появилась. `slugs` — слаги по новой выгрузке (по прежней они те же:
 * заголовки и даты не менялись, это проверяется).
 */
export function buildChanges(
  base: ReadonlyArray<ExportRecord>,
  next: ReadonlyArray<ExportRecord>,
  slugs: ReadonlyArray<string>,
  baseSlugs: ReadonlyArray<string>,
): NewsChange[] {
  if (
    base.length !== next.length ||
    slugs.length !== next.length ||
    baseSlugs.length !== base.length
  ) {
    throw new Error(`выгрузки разной длины: прежняя ${base.length}, новая ${next.length}`);
  }
  const newMap = slugMapBySource(
    next.map((r) => r["Источник"]),
    slugs,
  );
  const oldMap = slugMapBySource(
    base.map((r) => r["Источник"]),
    baseSlugs,
  );
  const changes: NewsChange[] = [];
  next.forEach((n, i) => {
    const b = base[i];
    if (b["Заголовок"] !== n["Заголовок"] || b["Дата"] !== n["Дата"] || slugs[i] !== baseSlugs[i]) {
      throw new Error(`запись ${i}: заголовок, дата или слаг разошлись между выгрузками`);
    }
    const keys = new Set([...Object.keys(b), ...Object.keys(n)]);
    const differing = [...keys].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(n[k]));
    if (differing.length === 0) return;
    const foreign = differing.filter((k) => !CHANGEABLE.has(k));
    if (foreign.length > 0) {
      throw new Error(
        `запись ${i} «${n["Заголовок"]}»: изменены поля вне разрешённых: ${foreign.join(", ")}`,
      );
    }
    const slug = slugs[i];
    const oldGallery = b["Галерея"] ?? [];
    const newGallery = n["Галерея"] ?? [];
    if (newGallery.length < oldGallery.length || oldGallery.some((g, j) => newGallery[j] !== g)) {
      throw new Error(`запись ${i} «${n["Заголовок"]}»: галерея изменена не дописыванием`);
    }
    const coverChanged = b["Обложка"] !== n["Обложка"];
    if (coverChanged && b["Обложка"] !== undefined) {
      throw new Error(`запись ${i} «${n["Заголовок"]}»: обложка заменена, а не добавлена`);
    }
    const oldRows = rowsOfRecord(slug, b);
    const newRows = rowsOfRecord(slug, n);
    const added = newRows.rows.filter((r) => !oldRows.rows.some((o) => o.key === r.key));
    const pathOf = (row: { key: string; position: number }): string =>
      row.position === 0 ? (n["Обложка"] as string) : newGallery[row.position - 1];
    changes.push({
      index: i,
      slug,
      title: n["Заголовок"],
      date: n["Дата"],
      oldBody: bodyInDatabase(b, slug, oldMap),
      newBody: bodyInDatabase(n, slug, newMap),
      oldSource: b["Источник"] ?? null,
      newSource: n["Источник"] ?? null,
      addPhotos: added.map((r) => ({
        key: r.key,
        position: r.position,
        isCover: r.position === 0,
        exportPath: pathOf(r),
      })),
      oldRows: oldRows.rows,
      oldCoverKey: oldRows.coverKey,
      newCoverKey: newRows.coverKey,
    });
  });
  return changes;
}

// ───────────────────────── сверка состояния базы ─────────────────────────

export type DbNews = {
  id: string;
  slug: string;
  status: string;
  deletedAt: Date | null;
  body: string | null;
  source: string | null;
  coverPhotoId: string | null;
  photos: ReadonlyArray<{ id: string; key: string; position: number }>;
};

export type StateVerdict =
  | { kind: "к записи" }
  | { kind: "уже сделано" }
  | { kind: "расходится"; reasons: string[] };

/** Сравнение фото и обложки с ожидаемым набором; возвращает причины расхождения. */
function photoMismatch(
  db: DbNews,
  rows: ReadonlyArray<{ key: string; position: number }>,
  coverKey: string | null,
): string[] {
  const reasons: string[] = [];
  const have = [...db.photos].sort((a, b) => a.position - b.position);
  const same =
    have.length === rows.length &&
    have.every((p, i) => p.key === rows[i].key && p.position === rows[i].position);
  if (!same) {
    reasons.push(
      `фото в базе ${have.length} (${have.map((p) => `${p.position}:${p.key}`).join(", ")}), ожидалось ${rows.length} (${rows.map((r) => `${r.position}:${r.key}`).join(", ")})`,
    );
  }
  const coverRow = db.coverPhotoId ? have.find((p) => p.id === db.coverPhotoId) : undefined;
  const haveCover = coverRow ? coverRow.key : null;
  if (haveCover !== coverKey) {
    reasons.push(`обложка в базе ${haveCover ?? "нет"}, ожидалась ${coverKey ?? "нет"}`);
  }
  return reasons;
}

/**
 * Что делать с новостью: она в прежнем состоянии (к записи), уже в новом
 * (сделано) или разошлась с обоими — тогда не трогаем и печатаем причину.
 * Слаг, статус и мягкое удаление проверяются до всего: новость, которой
 * нет или которая снята, не правится.
 */
export function classifyState(change: NewsChange, db: DbNews | null, found: number): StateVerdict {
  if (db === null || found !== 1) {
    return {
      kind: "расходится",
      reasons: [`в базе найдено строк ${found} по «заголовок + дата», ожидалась одна`],
    };
  }
  const head: string[] = [];
  if (db.slug !== change.slug) head.push(`слаг в базе ${db.slug}, ожидался ${change.slug}`);
  if (db.status !== "published") head.push(`статус ${db.status}`);
  if (db.deletedAt !== null) head.push("новость снята (deleted_at)");
  if (head.length > 0) return { kind: "расходится", reasons: head };

  const newRows = [
    ...change.oldRows,
    ...change.addPhotos.map((p) => ({ key: p.key, position: p.position })),
  ]
    .filter((r, i, all) => all.findIndex((x) => x.key === r.key) === i)
    .sort((a, b) => a.position - b.position);
  const doneReasons = [
    ...(db.body === change.newBody ? [] : ["тело не новое"]),
    ...(db.source === change.newSource ? [] : ["source не новый"]),
    ...photoMismatch(db, newRows, change.newCoverKey),
  ];
  if (doneReasons.length === 0) return { kind: "уже сделано" };

  const oldReasons: string[] = [];
  if (db.body !== change.oldBody) oldReasons.push(bodyDiff(db.body ?? "", change.oldBody));
  if (db.source !== change.oldSource)
    oldReasons.push(`source в базе ${db.source}, ожидался ${change.oldSource}`);
  oldReasons.push(...photoMismatch(db, change.oldRows, change.oldCoverKey));
  if (oldReasons.length === 0) return { kind: "к записи" };
  return { kind: "расходится", reasons: oldReasons };
}

/** Первое расхождение двух тел: позиция и по 60 знаков с каждой стороны. */
export function bodyDiff(inDb: string, expected: string): string {
  let k = 0;
  while (k < inDb.length && k < expected.length && inDb[k] === expected[k]) k += 1;
  return (
    `тело ОТЛИЧАЕТСЯ с позиции ${k}: база «${inDb.slice(Math.max(0, k - 30), k + 60)}» / ` +
    `выгрузка «${expected.slice(Math.max(0, k - 30), k + 60)}»`
  );
}

// ───────────────────────── объекты хранилища ─────────────────────────

export type ObjectDecision =
  | { action: "залить"; created: true }
  | { action: "уже есть"; created: false }
  | { action: "стоп"; reason: string };

/**
 * Перезаписи нет: объекта нет — заливаем и помечаем «создан этой операцией»;
 * есть того же размера — штатно (вторая схема на общем бакете), не наш, не
 * трогаем; есть другого размера — стоп: под этим ключом лежит чужое.
 */
export function decideObject(remote: { size: number } | null, localSize: number): ObjectDecision {
  if (remote === null) return { action: "залить", created: true };
  if (remote.size === localSize) return { action: "уже есть", created: false };
  return {
    action: "стоп",
    reason: `в бакете объект другого размера (${remote.size} Б, файл ${localSize} Б)`,
  };
}

// ───────────────────────── файл отката ─────────────────────────

export type RollbackObject = {
  key: string;
  /** Залит этой операцией (HEAD дал 404 до заливки). Только такие удаляет откат. */
  created: boolean;
  size: number | null;
  etag: string | null;
};

export type RollbackItem = {
  id: string;
  slug: string;
  oldBody: string;
  newBody: string;
  oldSource: string | null;
  newSource: string | null;
  oldCoverPhotoId: string | null;
  rows: Array<{
    id: string;
    key: string;
    position: number;
    width: number;
    height: number;
    isCover: boolean;
  }>;
  objects: RollbackObject[];
  applied: boolean;
};

export type RollbackFile = {
  version: 1;
  createdAt: string;
  /** `хост/база` — без логина и пароля. */
  target: string;
  schema: "dev" | "public";
  items: RollbackItem[];
};

export function parseRollbackFile(text: string): RollbackFile {
  const data = JSON.parse(text) as Partial<RollbackFile>;
  if (
    data.version !== 1 ||
    typeof data.target !== "string" ||
    (data.schema !== "dev" && data.schema !== "public") ||
    !Array.isArray(data.items)
  ) {
    throw new Error("файл отката не разобран: неверная версия или состав");
  }
  for (const item of data.items) {
    if (
      typeof item.id !== "string" ||
      typeof item.slug !== "string" ||
      typeof item.oldBody !== "string" ||
      typeof item.newBody !== "string" ||
      !Array.isArray(item.rows) ||
      !Array.isArray(item.objects) ||
      typeof item.applied !== "boolean"
    ) {
      throw new Error(`файл отката не разобран: запись ${String(item?.slug)}`);
    }
  }
  return data as RollbackFile;
}

/** Откат идёт только туда, где записывали: хост/база и схема из файла обязаны совпасть. */
export function checkRollbackTarget(
  file: Pick<RollbackFile, "target" | "schema">,
  current: { target: string; schema: string },
): string | null {
  if (file.target !== current.target) {
    return `цель в файле отката ${file.target}, а подключение к ${current.target} — откат отменён`;
  }
  if (file.schema !== current.schema) {
    return `схема в файле отката ${file.schema}, а указана ${current.schema} — откат отменён`;
  }
  return null;
}

export type RollbackAction =
  | { kind: "откатить" }
  | { kind: "уже откачено" }
  | { kind: "расходится"; reason: string };

/**
 * Что делать с новостью при откате. Откатываем только то, что в базе
 * ровно так, как записала операция: тело правили после неё — не затираем.
 */
export function rollbackAction(
  item: RollbackItem,
  db: { body: string | null; source: string | null; presentRowIds: ReadonlyArray<string> } | null,
): RollbackAction {
  if (db === null) return { kind: "расходится", reason: "новости нет в базе" };
  const present = item.rows.filter((r) => db.presentRowIds.includes(r.id)).length;
  if (present === 0 && db.body === item.oldBody && db.source === item.oldSource) {
    return { kind: "уже откачено" };
  }
  if (db.body !== item.newBody)
    return { kind: "расходится", reason: "тело после операции правили" };
  if (db.source !== item.newSource)
    return { kind: "расходится", reason: "source после операции правили" };
  if (present !== item.rows.length) {
    return {
      kind: "расходится",
      reason: `строк операции в базе ${present} из ${item.rows.length}`,
    };
  }
  return { kind: "откатить" };
}

export type ObjectRemoval = { delete: boolean; reason: string };

/**
 * Удалить объект при откате — только если: он залит этой операцией; в файле
 * есть его ETag и размер, и они равны текущим в бакете; и ни одна строка
 * `news_photo` ни в одной схеме на него не ссылается.
 */
export function mayDeleteObject(o: {
  created: boolean;
  fileEtag: string | null;
  fileSize: number | null;
  remote: { etag: string; size: number } | null;
  referencedByRows: number;
}): ObjectRemoval {
  if (!o.created) return { delete: false, reason: "объект залит не этой операцией" };
  if (o.remote === null) return { delete: false, reason: "объекта в бакете уже нет" };
  if (o.fileEtag === null || o.fileSize === null) {
    return { delete: false, reason: "в файле отката нет ETag и размера" };
  }
  if (o.remote.etag !== o.fileEtag || o.remote.size !== o.fileSize) {
    return { delete: false, reason: "ETag или размер объекта не совпали с файлом отката" };
  }
  if (o.referencedByRows > 0) {
    return {
      delete: false,
      reason: `на объект ссылаются строки news_photo: ${o.referencedByRows}`,
    };
  }
  return { delete: true, reason: "создан операцией, ETag и размер совпали, ссылок нет" };
}
