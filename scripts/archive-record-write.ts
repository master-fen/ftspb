/**
 * Как мигратор пишет одну запись архива: порядок фаз и повторы при сбое
 * хранилища. Обе операции подставляются вызывающим, поэтому модуль
 * проверяется тестами без S3, без базы и без диска — как и соседний
 * scripts/archive-migration-rules.ts.
 *
 * Потребитель один — scripts/migrate-archive.ts под bun.
 */

// ───────────────────────── объекты записи ─────────────────────────

/** Один объект хранилища, принадлежащий записи. */
export type RecordObject = {
  /** Ключ в бакете — он же попадает в сообщение об обрыве. */
  key: string;
  localPath: string;
  contentType: string;
  /** Вид нужен только счётчику вывода: фото и документы считаются порознь. */
  kind: "photo" | "document";
};

/** Сколько объектов записи прошло первую фазу, по видам. */
export type ObjectCounts = { photos: number; documents: number };

export type RecordWriteFailure =
  | { ok: false; phase: "objects"; objectKey: string; error: unknown }
  | { ok: false; phase: "database"; error: unknown };

export type RecordWriteOutcome = { ok: true; counts: ObjectCounts } | RecordWriteFailure;

/**
 * Запись добавляется целиком или никак.
 *
 * Сначала **все** объекты записи проверены и при необходимости залиты, и
 * только потом — **одна** транзакция базы. Сбой первой фазы означает, что в
 * базе этой записи нет вовсе; сбой второй откатывает её целиком. Прежний
 * порядок — вставить новость, а потом дописывать фото вперемешку с заливкой —
 * оставлял после обрыва новость с частью галереи, и повторный запуск с
 * `--add-only` пропускал её по слагу.
 *
 * Функция ничего не бросает: исход возвращается разбором случая, как
 * `CoverageVerdict` и `AddOnlyDecision` в соседнем модуле. Вызывающий обязан
 * проверить `ok` — иначе обращение к `counts` не компилируется.
 *
 * Транзакцией управляет `writeRows`: здесь про неё известно только то, что
 * она либо целиком удалась, либо целиком нет.
 */
export async function writeRecordAtomically(
  objects: ReadonlyArray<RecordObject>,
  ops: {
    putObject: (object: RecordObject) => Promise<void>;
    writeRows: () => Promise<void>;
  },
): Promise<RecordWriteOutcome> {
  const counts: ObjectCounts = { photos: 0, documents: 0 };
  for (const object of objects) {
    try {
      await ops.putObject(object);
    } catch (error) {
      return { ok: false, phase: "objects", objectKey: object.key, error };
    }
    if (object.kind === "photo") {
      counts.photos += 1;
    } else {
      counts.documents += 1;
    }
  }
  try {
    await ops.writeRows();
  } catch (error) {
    return { ok: false, phase: "database", error };
  }
  return { ok: true, counts };
}

// ───────────────────────── повторы при сбое хранилища ─────────────────────────

/**
 * Паузы между попытками мигратора, в миллисекундах: 2 с, 5 с, 15 с, 30 с.
 * Пять попыток всего, до 52 с ожидания на объект.
 *
 * Клиент хранилища делает внутри каждой попытки свои три (умолчание smithy,
 * `DEFAULT_MAX_ATTEMPTS = 3`) с паузами в доли секунды — этого хватает на
 * моргание и не хватает на пропажу сети на минуту, из-за которой оборвалась
 * заливка 24.09.2026. Паузы ровные, без джиттера: поток один, распугивать
 * стадо не от кого, а ровные числа читаются в журнале.
 *
 * Настройки самого клиента (`src/server/storage.ts`) при этом не трогаются:
 * модуль общий с админкой, где человек ждёт загрузку файла и минута крутилки
 * недопустима.
 */
export const RETRY_PAUSES_MS: readonly number[] = [2_000, 5_000, 15_000, 30_000];

/** Коды ответа, которые имеет смысл повторять. */
const RETRIABLE_STATUS = new Set([408, 429]);

/** Сетевые коды: соединение не состоялось или оборвалось. */
const RETRIABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) {
    return undefined;
  }
  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

/** Сетевой код бывает и на самой ошибке, и внутри `cause` обёртки клиента. */
function hasRetriableCode(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth > 5) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && RETRIABLE_CODES.has(code)) {
    return true;
  }
  return hasRetriableCode((error as { cause?: unknown }).cause, depth + 1);
}

/**
 * Повторять — только то, что от повтора может пройти.
 *
 * Да: обрыв соединения (в том числе спрятанный в `cause`), 408, 429 и любой
 * код 5xx. Нет: 403 и прочие 4xx — неверный ключ доступа не исправится с
 * пятого раза, а 52 с на объект превратили бы отказ в зависание. 404 сюда не
 * доходит вовсе: под `--skip-uploaded` это штатный ответ «объекта нет», и его
 * разбирает `isS3NotFound` вокруг обёртки.
 *
 * Отдельным случаем не повторяется искусственный обрыв (`synthetic`):
 * проверка атомарности не должна ждать полный бюджет пауз.
 */
export function isRetriableStorageError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    if ((error as { synthetic?: unknown }).synthetic === true) {
      return false;
    }
  }
  const status = statusOf(error);
  if (status !== undefined) {
    return status >= 500 || RETRIABLE_STATUS.has(status);
  }
  return hasRetriableCode(error);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Одна операция хранилища с нарастающими паузами. `sleep` подставляется
 * тестом: иначе проверка повторов шла бы 52 секунды.
 */
export async function retryStorage<T>(
  operation: () => Promise<T>,
  ops: {
    pauses?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (info: { attempt: number; total: number; pauseMs: number; error: unknown }) => void;
  } = {},
): Promise<T> {
  const pauses = ops.pauses ?? RETRY_PAUSES_MS;
  const sleep = ops.sleep ?? wait;
  for (let index = 0; ; index += 1) {
    try {
      return await operation();
    } catch (error) {
      if (index >= pauses.length || !isRetriableStorageError(error)) {
        throw error;
      }
      const pauseMs = pauses[index];
      ops.onRetry?.({ attempt: index + 2, total: pauses.length + 1, pauseMs, error });
      await sleep(pauseMs);
    }
  }
}

// ───────────────────────── сообщение об обрыве ─────────────────────────

/**
 * Та же команда без ключей искусственного обрыва: оператор копирует её и
 * продолжает с места обрыва, а не ломается снова там же.
 */
export function repeatCommandLine(argv: ReadonlyArray<string>): string {
  const kept = argv
    .filter((arg) => !arg.startsWith("--fail-after-"))
    .map((arg) => (arg.includes(" ") ? `"${arg}"` : arg));
  return `bun run migrate:archive ${kept.join(" ")}`;
}

export type RecordAbort = {
  failure: RecordWriteFailure;
  slug: string;
  /** Номер записи, на которой оборвалось, с единицы. */
  number: number;
  total: number;
  /** Сколько записей добавлено до обрыва — все целиком. */
  applied: number;
  repeatCommand: string;
  skipUploaded: boolean;
};

/**
 * Строки для оператора вместо сырого стека: где оборвалось, что в базе, что
 * делать дальше. Отдельная чистая функция — чтобы текст проверялся тестом.
 */
export function formatRecordAbort(abort: RecordAbort): string[] {
  const { failure } = abort;
  const lines = [`Обрыв: запись ${abort.number} из ${abort.total} — /news/${abort.slug}`];
  if (failure.phase === "objects") {
    lines.push("Фаза: объекты хранилища. В базу по этой записи не записано ничего.");
    lines.push(`Оборвалось на объекте: ${failure.objectKey}`);
  } else {
    lines.push("Фаза: транзакция базы. Откат выполнен, этой записи в базе нет.");
  }
  lines.push(
    `Причина: ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`,
  );
  lines.push(`Добавлено записей до обрыва: ${abort.applied} — каждая целиком, неполных нет.`);
  if (abort.skipUploaded) {
    lines.push(
      "Объекты этой записи, уже лежащие в бакете, безвредны: повтор заливает поверх только при несовпадении размера.",
    );
  } else {
    lines.push(
      "Совет: добавьте --skip-uploaded — уже залитые объекты того же размера повтор пропустит.",
    );
  }
  lines.push("Запустите ту же команду ещё раз — она продолжит с этого места:");
  lines.push(`  ${abort.repeatCommand}`);
  return lines;
}
