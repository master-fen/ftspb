import { describe, expect, test } from "bun:test";
import { syntheticStorageBreak } from "./archive-migration-rules";
import {
  RETRY_PAUSES_MS,
  type RecordObject,
  type RecordWriteFailure,
  formatRecordAbort,
  isRetriableStorageError,
  repeatCommandLine,
  retryStorage,
  writeRecordAtomically,
} from "./archive-record-write";

const photo = (key: string): RecordObject => ({
  key,
  localPath: `D:/x/${key}`,
  contentType: "image/jpeg",
  kind: "photo",
});
const doc = (key: string): RecordObject => ({
  key,
  localPath: `D:/x/${key}`,
  contentType: "application/pdf",
  kind: "document",
});

/** Журнал вызовов: по нему видно и состав, и порядок. */
function stand(options: { failOn?: string; failRows?: boolean } = {}) {
  const log: string[] = [];
  return {
    log,
    ops: {
      putObject: async (object: RecordObject) => {
        if (options.failOn === object.key) {
          log.push(`put-fail:${object.key}`);
          throw new Error(`сеть отвалилась на ${object.key}`);
        }
        log.push(`put:${object.key}`);
      },
      writeRows: async () => {
        if (options.failRows) {
          // Так ведёт себя транзакция drizzle: тело бросило — откат и проброс.
          log.push("tx-begin");
          log.push("tx-rollback");
          throw new Error("база отвалилась");
        }
        log.push("tx-commit");
        return "создана" as const;
      },
    },
  };
}

describe("запись целиком или никак", () => {
  test("успех: сначала все объекты, затем ровно одна транзакция", async () => {
    const s = stand();
    const outcome = await writeRecordAtomically(
      [photo("cover.jpg"), photo("01.jpg"), doc("01.pdf")],
      s.ops,
    );
    expect(outcome.ok).toBe(true);
    expect(s.log).toEqual(["put:cover.jpg", "put:01.jpg", "put:01.pdf", "tx-commit"]);
  });

  test("успех: объекты сосчитаны по видам", async () => {
    const s = stand();
    const outcome = await writeRecordAtomically(
      [photo("cover.jpg"), photo("01.jpg"), doc("01.pdf")],
      s.ops,
    );
    if (!outcome.ok) throw new Error("ожидался успех");
    expect(outcome.counts).toEqual({ photos: 2, documents: 1 });
  });

  test("успех: значение транзакции доезжает до вызывающего", async () => {
    // По нему мигратор печатает «создана»/«обновлена» — после коммита, а не
    // внутри тела, которое может откатиться.
    const outcome = await writeRecordAtomically([photo("cover.jpg")], stand().ops);
    if (!outcome.ok) throw new Error("ожидался успех");
    expect(outcome.rows).toBe("создана");
  });

  test("порядок объектов буквальный: по видам не переупорядочивается", async () => {
    const s = stand();
    await writeRecordAtomically([doc("01.pdf"), photo("cover.jpg")], s.ops);
    expect(s.log).toEqual(["put:01.pdf", "put:cover.jpg", "tx-commit"]);
  });

  test("сбой хранилища на втором объекте: база не тронута, третий не заливался", async () => {
    const s = stand({ failOn: "01.jpg" });
    const outcome = await writeRecordAtomically(
      [photo("cover.jpg"), photo("01.jpg"), photo("02.jpg")],
      s.ops,
    );
    expect(s.log).toEqual(["put:cover.jpg", "put-fail:01.jpg"]);
    expect(s.log).not.toContain("tx-commit");
    expect(s.log).not.toContain("tx-begin");
    expect(outcome).toMatchObject({ ok: false, phase: "objects", objectKey: "01.jpg" });
  });

  test("сбой хранилища доносит исходную ошибку тем же объектом", async () => {
    const s = stand({ failOn: "cover.jpg" });
    const outcome = await writeRecordAtomically([photo("cover.jpg")], s.ops);
    if (outcome.ok) throw new Error("ожидался сбой");
    expect((outcome.error as Error).message).toBe("сеть отвалилась на cover.jpg");
  });

  test("сбой внутри транзакции: откат, все объекты при этом залиты", async () => {
    const s = stand({ failRows: true });
    const outcome = await writeRecordAtomically([photo("cover.jpg"), doc("01.pdf")], s.ops);
    expect(s.log).toEqual(["put:cover.jpg", "put:01.pdf", "tx-begin", "tx-rollback"]);
    expect(outcome).toMatchObject({ ok: false, phase: "database" });
    expect(outcome).not.toHaveProperty("objectKey");
  });

  test("запись без объектов: транзакция всё равно ровно одна", async () => {
    const s = stand();
    const outcome = await writeRecordAtomically([], s.ops);
    expect(s.log).toEqual(["tx-commit"]);
    if (!outcome.ok) throw new Error("ожидался успех");
    expect(outcome.counts).toEqual({ photos: 0, documents: 0 });
  });

  test("ни при каком сбое не бросает: исход возвращается", async () => {
    await expect(
      writeRecordAtomically([photo("cover.jpg")], stand({ failOn: "cover.jpg" }).ops),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      writeRecordAtomically([photo("cover.jpg")], stand({ failRows: true }).ops),
    ).resolves.toMatchObject({ ok: false });
  });
});

describe("повторы при сбое хранилища", () => {
  const netError = (code: string) => Object.assign(new Error(code), { code });
  const httpError = (httpStatusCode: number) =>
    Object.assign(new Error(`HTTP ${httpStatusCode}`), { $metadata: { httpStatusCode } });

  test("обрыв дважды, затем успех: три вызова, две паузы, результат возвращён", async () => {
    const pauses: number[] = [];
    let calls = 0;
    const result = await retryStorage(
      async () => {
        calls += 1;
        if (calls <= 2) throw netError("ECONNREFUSED");
        return "залито";
      },
      { sleep: async (ms) => void pauses.push(ms) },
    );
    expect(result).toBe("залито");
    expect(calls).toBe(3);
    expect(pauses).toEqual([2_000, 5_000]);
  });

  test("403 — без повторов, отказ сразу", async () => {
    const pauses: number[] = [];
    let calls = 0;
    await expect(
      retryStorage(
        async () => {
          calls += 1;
          throw httpError(403);
        },
        { sleep: async (ms) => void pauses.push(ms) },
      ),
    ).rejects.toThrow("HTTP 403");
    expect(calls).toBe(1);
    expect(pauses).toEqual([]);
  });

  test("пять неудач подряд: четыре паузы и ошибка последней попытки", async () => {
    const pauses: number[] = [];
    let calls = 0;
    await expect(
      retryStorage(
        async () => {
          calls += 1;
          throw Object.assign(new Error(`сбой #${calls}`), { code: "ETIMEDOUT" });
        },
        { sleep: async (ms) => void pauses.push(ms) },
      ),
    ).rejects.toThrow("сбой #5");
    expect(calls).toBe(5);
    expect(pauses).toEqual([...RETRY_PAUSES_MS]);
  });

  test("паузы заморожены: 2/5/15/30 секунд, всего 52 секунды", () => {
    expect(RETRY_PAUSES_MS).toEqual([2_000, 5_000, 15_000, 30_000]);
    expect(RETRY_PAUSES_MS.reduce((a, b) => a + b, 0)).toBe(52_000);
  });

  test("onRetry называет номер попытки, общее число и паузу", async () => {
    const seen: string[] = [];
    let calls = 0;
    await retryStorage(
      async () => {
        calls += 1;
        if (calls === 1) throw netError("ECONNRESET");
        return 1;
      },
      {
        sleep: async () => {},
        onRetry: ({ attempt, total, pauseMs }) => seen.push(`${attempt}/${total} ${pauseMs}`),
      },
    );
    expect(seen).toEqual(["2/5 2000"]);
  });

  test("повторять: сетевые коды, 408, 429, любой 5xx", () => {
    for (const code of [
      "ECONNRESET",
      "ECONNREFUSED",
      "EPIPE",
      "ETIMEDOUT",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ENOTFOUND",
      "EAI_AGAIN",
    ]) {
      expect({ code, retry: isRetriableStorageError(netError(code)) }).toEqual({
        code,
        retry: true,
      });
    }
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect({ status, retry: isRetriableStorageError(httpError(status)) }).toEqual({
        status,
        retry: true,
      });
    }
  });

  test("не повторять: 403, 400, 413 и 404", () => {
    for (const status of [400, 403, 404, 413]) {
      expect({ status, retry: isRetriableStorageError(httpError(status)) }).toEqual({
        status,
        retry: false,
      });
    }
  });

  test("сетевой код внутри cause тоже считается", () => {
    const wrapped = new Error("обёртка клиента");
    (wrapped as Error & { cause?: unknown }).cause = netError("ECONNRESET");
    expect(isRetriableStorageError(wrapped)).toBe(true);
  });

  test("искусственный обрыв не повторяется — иначе проверка ждала бы 52 секунды", () => {
    // Сверка с той самой ошибкой, которую бросает --fail-after-objects.
    expect(isRetriableStorageError(syntheticStorageBreak("news/x/01.jpg"))).toBe(false);
    // Положительный контроль: та же форма без метки повторяется.
    expect(isRetriableStorageError(netError("ECONNREFUSED"))).toBe(true);
  });

  test("незнакомая ошибка без кода и статуса не повторяется", () => {
    expect(isRetriableStorageError(new Error("что-то не то"))).toBe(false);
    expect(isRetriableStorageError("строка")).toBe(false);
    expect(isRetriableStorageError(null)).toBe(false);
  });
});

describe("сообщение об обрыве", () => {
  const objectsFailure: RecordWriteFailure = {
    ok: false,
    phase: "objects",
    objectKey: "news/kubok/12.jpg",
    error: new Error("connect ECONNREFUSED 185.12.34.56:443"),
  };
  const base = {
    slug: "kubok",
    number: 749,
    total: 1937,
    applied: 748,
    repeatCommand: "bun run migrate:archive --schema=dev",
    skipUploaded: true,
  };

  test("фаза объектов: назван объект и сказано, что в базе записи нет", () => {
    const lines = formatRecordAbort({ ...base, failure: objectsFailure });
    expect(lines[0]).toBe("Обрыв: запись 749 из 1937 — /news/kubok");
    expect(lines[1]).toContain("В базу по этой записи не записано ничего");
    expect(lines[2]).toBe("Оборвалось на объекте: news/kubok/12.jpg");
    expect(lines).toContain("Причина: connect ECONNREFUSED 185.12.34.56:443");
    expect(lines).toContain("Добавлено записей до обрыва: 748 — каждая целиком, неполных нет.");
    expect(lines.at(-2)).toBe("Запустите ту же команду ещё раз — она продолжит с этого места:");
    expect(lines.at(-1)).toBe("  bun run migrate:archive --schema=dev");
  });

  test("фаза базы: сказано про откат, строки про объект нет", () => {
    const lines = formatRecordAbort({
      ...base,
      failure: { ok: false, phase: "database", error: new Error("деадлок") },
    });
    expect(lines[1]).toBe("Фаза: транзакция базы. Откат выполнен, этой записи в базе нет.");
    expect(lines.join("\n")).not.toContain("Оборвалось на объекте");
  });

  test("без --skip-uploaded даётся совет добавить ключ", () => {
    const with_ = formatRecordAbort({ ...base, failure: objectsFailure }).join("\n");
    const without = formatRecordAbort({
      ...base,
      skipUploaded: false,
      failure: objectsFailure,
    }).join("\n");
    expect(with_).toContain("повтор заливает поверх только при несовпадении размера");
    expect(with_).not.toContain("Совет:");
    expect(without).toContain("Совет: добавьте --skip-uploaded");
  });
});

describe("команда для повтора", () => {
  test("ключи обрыва снимаются, порядок остальных сохраняется", () => {
    expect(
      repeatCommandLine([
        "--source=D:/Webarchive/compressed",
        "--fail-after-objects=4000",
        "--schema=dev",
        "--add-only",
        "--fail-after-records=5",
        "--skip-uploaded",
      ]),
    ).toBe(
      "bun run migrate:archive --source=D:/Webarchive/compressed --schema=dev --add-only --skip-uploaded",
    );
  });

  test("аргумент с пробелом берётся в кавычки", () => {
    expect(repeatCommandLine(["--source=D:/Web archive"])).toBe(
      'bun run migrate:archive "--source=D:/Web archive"',
    );
  });
});
