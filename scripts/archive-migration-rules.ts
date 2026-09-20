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
import { LEGACY_SLUG_MAX_LENGTH, slugify, truncateSlug } from "../src/server/slug";

// ───────────────────────── общее ─────────────────────────

/** Нормализация заголовка для сравнения: края и повторы пробелов. */
export function normalizeTitle(title: string): string {
  throw new Error(`не реализовано: normalizeTitle(${title})`);
}

/** Ключ сравнения «заголовок + дата» — им пользуются справка и старый контроль. */
export function titleDateKey(title: string, publishedAt: string): string {
  throw new Error(`не реализовано: titleDateKey(${title}, ${publishedAt})`);
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

/**
 * Отметка создания записи по её рангу внутри дня (с нуля, в порядке массива
 * выгрузки). Ранг 0 — верхняя запись дня на старом сайте, ей нужна самая
 * поздняя отметка, поэтому шаг вычитается. Значение зависит только от
 * собственного ранга: префиксный срез (--limit) даёт те же отметки.
 */
export function createdAtForRank(publishedAt: string, rankInDay: number): Date {
  throw new Error(`не реализовано: createdAtForRank(${publishedAt}, ${rankInDay})`);
}

/** Отметки для всего массива выгрузки: ранг считается внутри каждого дня. */
export function createdAtByIndex(publishedDates: ReadonlyArray<string>): Date[] {
  throw new Error(`не реализовано: createdAtByIndex(${publishedDates.length})`);
}

// ───────────────────────── часть B: только добавить ─────────────────────────

/** Строка `news`, как её читает мигратор перед решением. */
export type ExistingNewsRow = {
  slug: string;
  title: string;
  publishedAt: string;
  deletedAt: Date | string | null;
};

export type SkipReason = "active" | "soft-deleted";

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
  throw new Error(`не реализовано: decideAddOnly(${slug}, ${existingBySlug.size})`);
}

export type AddOnlyPartition<T> = {
  insert: T[];
  skipped: Array<{ item: T; reason: SkipReason }>;
};

/** Разделение рабочего списка на вставляемые и пропускаемые, порядок сохраняется. */
export function partitionAddOnly<T extends { slug: string }>(
  items: ReadonlyArray<T>,
  existingBySlug: ReadonlyMap<string, ExistingNewsRow>,
): AddOnlyPartition<T> {
  throw new Error(`не реализовано: partitionAddOnly(${items.length}, ${existingBySlug.size})`);
}

// ───────────────── справка о совпадениях по «заголовок + дата» ─────────────────

/** Личность записи выгрузки — всё, что нужно и предохранителю, и справке. */
export type PlanIdentity = { slug: string; title: string; publishedAt: string };

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
 */
export function titleDateOverlap(
  existing: ReadonlyArray<ExistingNewsRow>,
  plans: ReadonlyArray<PlanIdentity>,
): TitleDateOverlap[] {
  throw new Error(`не реализовано: titleDateOverlap(${existing.length}, ${plans.length})`);
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
  throw new Error(
    `не реализовано: checkReplaceAllCoverage(${existing.length}, ${plans.length}, ${allowDataLoss})`,
  );
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
  throw new Error(`не реализовано: decideUpload(${args.skipUploaded}, ${args.localSize})`);
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
  throw new Error(
    `не реализовано: resolveSlugs(${records.length}, ${slugify("")}${truncateSlug("", LEGACY_SLUG_MAX_LENGTH)})`,
  );
}
