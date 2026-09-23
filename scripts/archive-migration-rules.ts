/**
 * Решения мигратора архива, вынесенные из scripts/migrate-archive.ts, чтобы
 * их можно было проверить тестами без базы, без S3 и без диска.
 *
 * Здесь живут ответы на четыре вопроса:
 *   - какое `created_at` получает запись, чтобы порядок внутри дня на новом
 *     сайте повторял порядок ленты старого (часть D задания);
 *   - что считать совпадением и что пропускать в режиме «только добавить»;
 *   - когда массовому режиму отказываться работать, чтобы не снести новости,
 *     которых нет в выгрузке;
 *   - заливать файл в S3 или пропустить, потому что он уже там.
 *
 * Потребитель один — scripts/migrate-archive.ts под bun, поэтому импорты
 * идут без расширения (в отличие от scripts/archive-markers.ts, который
 * делят node и bun).
 */
import { LEGACY_SLUG_MAX_LENGTH, slugify, truncateSlug } from "../src/server/slug.ts";

// ───────────────────────── общее ─────────────────────────

/** Нормализация заголовка для сравнения: края и повторы пробелов. */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

/**
 * Ключ сравнения «заголовок + дата» — им пользуются и справка, и пропуск по
 * ключу --skip-title-date. Регистр не учитывается: легаси писал один и тот же
 * заголовок то капслоком, то строчными, и пара «архивная ↔ заведённая руками»
 * из-за регистра терялась бы молча.
 */
export function titleDateKey(title: string, publishedAt: string): string {
  return `${normalizeTitle(title).toLowerCase()}|${publishedAt}`;
}

// ───────────────────────── часть D: created_at ─────────────────────────

/**
 * Полдень UTC. Лента сортирует `published_at desc, created_at desc, id desc`
 * (src/server/news.ts), а `published_at` — это date без времени. Отметка
 * 12:00Z остаётся в тех же сутках в любом поясе от UTC−11 до UTC+11, поэтому
 * человек, читающий базу глазами, видит дату новости, а не соседнюю.
 */
export const CREATED_AT_BASE_UTC_HOUR = 12;

/** Шаг между соседними записями одного дня. */
export const CREATED_AT_STEP_MS = 1000;

/** Сторож: при таком числе записей за день отметка уехала бы за полночь. */
export const MAX_RECORDS_PER_DAY = 3600;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Разбор `ГГГГ-ММ-ДД` в отметку полудня UTC с обратной сверкой.
 *
 * Одного `Date.parse` мало: он перекатывает несуществующие даты — на входе
 * `2024-02-30T12:00:00.000Z` он молча отдаёт 1 марта (проверено на node 24 и
 * на bun). Поэтому результат приводится обратно к `ГГГГ-ММ-ДД` и сверяется
 * с входом.
 */
function baseUtcNoon(publishedAt: string): number {
  if (!ISO_DATE_RE.test(publishedAt)) {
    throw new Error(`createdAtForRank: некорректная дата «${publishedAt}», нужен вид ГГГГ-ММ-ДД`);
  }
  const hour = String(CREATED_AT_BASE_UTC_HOUR).padStart(2, "0");
  const ms = Date.parse(`${publishedAt}T${hour}:00:00.000Z`);
  if (Number.isNaN(ms)) {
    throw new Error(`createdAtForRank: некорректная дата «${publishedAt}»`);
  }
  if (new Date(ms).toISOString().slice(0, 10) !== publishedAt) {
    throw new Error(
      `createdAtForRank: некорректная дата «${publishedAt}» — при разборе перекатилась в ` +
        `«${new Date(ms).toISOString().slice(0, 10)}»`,
    );
  }
  return ms;
}

/**
 * Отметка создания записи по её рангу внутри дня (с нуля, в порядке массива
 * выгрузки). Ранг 0 — верхняя запись дня на старом сайте, ей нужна самая
 * поздняя отметка, поэтому шаг вычитается. Значение зависит только от
 * собственного ранга: префиксный срез (--limit) даёт те же отметки.
 */
export function createdAtForRank(publishedAt: string, rankInDay: number): Date {
  const base = baseUtcNoon(publishedAt);
  if (!Number.isInteger(rankInDay) || rankInDay < 0) {
    throw new Error(`createdAtForRank: ранг ${rankInDay} должен быть целым неотрицательным`);
  }
  if (rankInDay >= MAX_RECORDS_PER_DAY) {
    throw new Error(
      `createdAtForRank: ранг ${rankInDay} за пределом суток (предел ${MAX_RECORDS_PER_DAY})`,
    );
  }
  return new Date(base - rankInDay * CREATED_AT_STEP_MS);
}

/** Отметки для всего массива выгрузки: ранг считается внутри каждого дня. */
export function createdAtByIndex(publishedDates: ReadonlyArray<string>): Date[] {
  const rankByDate = new Map<string, number>();
  return publishedDates.map((date) => {
    const rank = rankByDate.get(date) ?? 0;
    rankByDate.set(date, rank + 1);
    return createdAtForRank(date, rank);
  });
}

// ───────────────────────── часть B: только добавить ─────────────────────────

/** Строка `news`, как её читает мигратор перед решением. */
export type ExistingNewsRow = {
  slug: string;
  title: string;
  publishedAt: string;
  deletedAt: Date | string | null;
};

/** Личность записи выгрузки — всё, что нужно и предохранителю, и справке. */
export type PlanIdentity = { slug: string; title: string; publishedAt: string };

/**
 * `active` и `soft-deleted` — совпал слаг; `title-date` — совпали
 * нормализованный заголовок и дата под другим слагом (только при
 * --skip-title-date).
 */
export type SkipReason = "active" | "soft-deleted" | "title-date";

export type AddOnlyDecision = { action: "insert" } | { action: "skip"; reason: SkipReason };

/**
 * Совпадением считается слаг: он единственный с уникальным ограничением
 * (src/db/schema.ts), он же адрес /news/СЛАГ. Мягко удалённая новость с тем
 * же слагом тоже пропускается: ограничение не частичное, insert упал бы
 * 23505, а воскрешение отменило бы решение человека.
 */
export function decideAddOnly(
  slug: string,
  existingBySlug: ReadonlyMap<string, ExistingNewsRow>,
): AddOnlyDecision {
  const found = existingBySlug.get(slug);
  if (found === undefined) {
    return { action: "insert" };
  }
  return { action: "skip", reason: found.deletedAt == null ? "active" : "soft-deleted" };
}

export type AddOnlyPartition<T> = {
  insert: T[];
  skipped: Array<{ item: T; reason: SkipReason; existing?: ExistingNewsRow }>;
};

/**
 * Карта «заголовок + дата → новость схемы» для пропуска по --skip-title-date.
 *
 * Не идут в карту:
 *   - мягко удалённые: версии сайта у такой пары нет, человек её стёр, и
 *     архивную запись вместо неё оставляем;
 *   - новости, чей слаг выгрузка и так занимает (`exportSlugs`): это след
 *     прошлого прогона архива, а не версия сайта. Условие то же, что у
 *     справки (titleDateOverlap), и означает буквально «под другим слагом».
 */
export function indexByTitleDate(
  rows: ReadonlyArray<ExistingNewsRow>,
  exportSlugs: ReadonlySet<string> = new Set(),
): Map<string, ExistingNewsRow> {
  const map = new Map<string, ExistingNewsRow>();
  for (const row of rows) {
    if (row.deletedAt != null || exportSlugs.has(row.slug)) continue;
    const key = titleDateKey(row.title, row.publishedAt);
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

/**
 * Разделение рабочего списка на вставляемые и пропускаемые, порядок
 * сохраняется. `existingByTitleDate` передаётся только при --skip-title-date;
 * без неё поведение прежнее. Совпадение слага решает раньше: это одна и та же
 * новость по одному адресу, причина у неё своя.
 */
export function partitionAddOnly<T extends PlanIdentity>(
  items: ReadonlyArray<T>,
  existingBySlug: ReadonlyMap<string, ExistingNewsRow>,
  existingByTitleDate?: ReadonlyMap<string, ExistingNewsRow>,
): AddOnlyPartition<T> {
  const insert: T[] = [];
  const skipped: AddOnlyPartition<T>["skipped"] = [];
  for (const item of items) {
    const decision = decideAddOnly(item.slug, existingBySlug);
    if (decision.action === "skip") {
      skipped.push({ item, reason: decision.reason });
      continue;
    }
    const match = existingByTitleDate?.get(titleDateKey(item.title, item.publishedAt));
    if (match !== undefined) {
      skipped.push({ item, reason: "title-date", existing: match });
      continue;
    }
    insert.push(item);
  }
  return { insert, skipped };
}

// ───────────────── справка о совпадениях по «заголовок + дата» ─────────────────

export type TitleDateOverlap = {
  existing: ExistingNewsRow;
  planSlug: string;
  planTitle: string;
};

/**
 * Новости базы, совпавшие с выгрузкой по «заголовок + дата», но живущие под
 * другим слагом. Печатается всегда — и в сухом прогоне, и в боевом, в обоих
 * режимах: на боевом сайте это пары «архивная новость и заведённая руками»,
 * по каждой решает человек.
 *
 * Совпадение слага парой не считается: это одна и та же новость по одному
 * адресу, её судьбу решает режим, а не глаза.
 */
export function titleDateOverlap(
  existing: ReadonlyArray<ExistingNewsRow>,
  plans: ReadonlyArray<PlanIdentity>,
): TitleDateOverlap[] {
  const planSlugs = new Set(plans.map((p) => p.slug));
  const planByKey = new Map<string, PlanIdentity>();
  for (const p of plans) {
    const key = titleDateKey(p.title, p.publishedAt);
    if (!planByKey.has(key)) {
      planByKey.set(key, p);
    }
  }
  const out: TitleDateOverlap[] = [];
  for (const row of existing) {
    if (planSlugs.has(row.slug)) {
      continue;
    }
    const p = planByKey.get(titleDateKey(row.title, row.publishedAt));
    if (p !== undefined) {
      out.push({ existing: row, planSlug: p.slug, planTitle: p.title });
    }
  }
  return out;
}

// ───────────────── часть B2: предохранитель --replace-all ─────────────────

export type CoverageVerdict = {
  /** false — режим отказывается работать. */
  ok: boolean;
  /** Новости базы, чьего слага нет в выгрузке: их `--replace-all` снесёт. */
  missingBySlug: ExistingNewsRow[];
  /** То же по «заголовок + дата» — справка, на решение не влияет. */
  missingByTitleDate: ExistingNewsRow[];
  /** ok получен ключом --allow-data-loss, а не пустым списком. */
  bypassed: boolean;
};

/**
 * Критерий отказа — слаг. Он теряется безвозвратно: это адрес /news/СЛАГ и
 * префикс ключей S3 news/СЛАГ/…. Критерий «заголовок + дата» молчит там, где
 * новость заведена руками под другим слагом, то есть ошибается в сторону
 * потери, — поэтому он оставлен справкой.
 */
export function checkReplaceAllCoverage(
  existing: ReadonlyArray<ExistingNewsRow>,
  plans: ReadonlyArray<PlanIdentity>,
  allowDataLoss: boolean,
): CoverageVerdict {
  const planSlugs = new Set(plans.map((p) => p.slug));
  const planKeys = new Set(plans.map((p) => titleDateKey(p.title, p.publishedAt)));
  const missingBySlug = existing.filter((r) => !planSlugs.has(r.slug));
  const missingByTitleDate = existing.filter(
    (r) => !planKeys.has(titleDateKey(r.title, r.publishedAt)),
  );
  return {
    ok: missingBySlug.length === 0 || allowDataLoss,
    missingBySlug,
    missingByTitleDate,
    bypassed: missingBySlug.length > 0 && allowDataLoss,
  };
}

// ───────────────────────── часть C: заливать или нет ─────────────────────────

/** Что известно об объекте в бакете: null — объекта нет. */
export type RemoteObject = { size: number } | null;

export type UploadDecision = "upload" | "skip" | "reupload-size-mismatch";

/**
 * Пропуск — осознанное решение, поэтому при выключенном ключе ответ всегда
 * «заливать». Несовпадение размера отделено от обычной заливки: 66 объектов
 * уже пересжаты на месте 18.09.2026, и молчаливая перезаливка отменила бы
 * сжатие — такой случай обязан попасть в вывод отдельной строкой.
 */
export function decideUpload(args: {
  skipUploaded: boolean;
  remote: RemoteObject;
  localSize: number;
}): UploadDecision {
  if (!args.skipUploaded || args.remote === null) {
    return "upload";
  }
  return args.remote.size === args.localSize ? "skip" : "reupload-size-mismatch";
}

// ───────────────────────── slug: коллизии ─────────────────────────

/** Минимум полей записи выгрузки, нужный для слага. */
export type SlugSource = { Заголовок?: string; Дата?: string };

/**
 * Слаги всего массива выгрузки. Считается один раз по полному списку: на
 * срезе (--limit) коллизия с записью за пределом среза не видна, и слаг
 * получился бы другим, чем при полном прогоне.
 */
export function resolveSlugs(records: ReadonlyArray<SlugSource>): string[] {
  // База обрезается до лимита старого сайта ДО разрешения коллизий — новые
  // slug совпадают с легаси. Датный суффикс добавляется поверх обрезанной
  // базы и может превысить лимит — это допустимо.
  const baseSlugs = records.map((r) =>
    truncateSlug(slugify(r["Заголовок"] ?? ""), LEGACY_SLUG_MAX_LENGTH),
  );
  const groups = new Map<string, number[]>();
  baseSlugs.forEach((base, i) => {
    const arr = groups.get(base) ?? [];
    arr.push(i);
    groups.set(base, arr);
  });

  const finalSlugs = new Array<string>(records.length);
  for (const [base, indices] of groups) {
    if (indices.length === 1) {
      finalSlugs[indices[0]] = base;
      continue;
    }
    for (const i of indices) {
      const isoMatch = records[i]["Дата"]?.match(/^\d{4}-\d{2}-\d{2}/);
      if (!isoMatch) {
        throw new Error(`Некорректная "Дата" у записи "${records[i]["Заголовок"]}"`);
      }
      finalSlugs[i] = `${base}-${isoMatch[0]}`;
    }
  }

  // Коллизии, оставшиеся и после датного суффикса (в архиве есть разные
  // новости с одинаковой парой заголовок+дата), получают порядковый суффикс
  // по порядку следования записей в файле экспорта: slug-дата, slug-дата-2,
  // slug-дата-3…
  const ordinal = new Map<string, number>();
  for (let i = 0; i < finalSlugs.length; i++) {
    const s = finalSlugs[i];
    const n = ordinal.get(s) ?? 0;
    ordinal.set(s, n + 1);
    if (n > 0) {
      finalSlugs[i] = `${s}-${n + 1}`;
    }
  }

  // Финальная проверка уникальности: бросает, если уникальность не достигнута
  // и после порядковых суффиксов (например, slug-дата-2 совпал с чьей-то базой).
  const seen = new Set<string>();
  for (const s of finalSlugs) {
    if (seen.has(s)) {
      throw new Error(`Дублирующийся slug после разрешения коллизии: ${s}`);
    }
    seen.add(s);
  }

  return finalSlugs;
}
