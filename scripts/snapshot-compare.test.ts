import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import { compareDirs, type ReadFile } from "./snapshot-compare";

// Встроенной самопроверки у прежней версии (cmpsnap.ts, md5 bf637ed9) не было;
// случаи синтетические, по форме нормализованного снимка: тег на строку,
// строка манифеста целиком в одной строке.

const manifestLine = (preloads: string[]) =>
  '<script class="$tsr" id="$tsr-stream-barrier">(self.$R=self.$R||{})["tsr"]=[];' +
  `$R[1]={routes:$R[2]={__root__:$R[3]={preloads:$R[4]=[${preloads
    .map((p) => `"${p}"`)
    .join(",")}]}}};</script>`;

const ROOT = ["/assets/index-HASH.js", "/assets/root-HASH.js"];
const SHUFFLED = [ROOT[1], ROOT[0]];

const page = (manifest: string, heading = '<h1 class="ui-h1">Заголовок</h1>') =>
  ["<main>", heading, manifest, "</main>"].join("\n");

const PRELOADS = "/assets/index-HASH.js\n/assets/root-HASH.js\n";

/** Каталоги в памяти: имя → текст. Порядок ключей — порядок листинга. */
const dirs = (a: Record<string, string>, b: Record<string, string>) => {
  const read: ReadFile = (side, name) => Buffer.from((side === "a" ? a : b)[name], "utf8");
  return compareDirs(Object.keys(a).sort(), Object.keys(b).sort(), read);
};

const base = (html: string) => ({ "p.html": html, "p.preloads.txt": PRELOADS });

describe("compareDirs", () => {
  test("1) пара совпала побайтно — все три числа полные", () => {
    const html = page(manifestLine(ROOT));
    const r = dirs(base(html), base(html));
    expect(r.messages).toEqual([]);
    expect(r.summary).toBe(
      "вне строки манифеста побайтно: 1/1; манифест после сортировки: 1/1 " +
        "(из них побайтно 1); .preloads.txt побайтно: 1/1",
    );
    expect(r.ok).toBe(true);
  });

  test("2) манифест различается только порядком preloads — «из них побайтно» на 1 меньше", () => {
    expect(SHUFFLED).not.toEqual(ROOT);
    const r = dirs(base(page(manifestLine(ROOT))), base(page(manifestLine(SHUFFLED))));
    expect(r.messages).toEqual([]);
    expect(r.summary).toBe(
      "вне строки манифеста побайтно: 1/1; манифест после сортировки: 1/1 " +
        "(из них побайтно 0); .preloads.txt побайтно: 1/1",
    );
    expect(r.ok).toBe(true);
  });

  test("3) манифест различается составом preloads — своя строка", () => {
    const r = dirs(
      base(page(manifestLine(ROOT))),
      base(page(manifestLine([...ROOT, "/assets/x-HASH.js"]))),
    );
    expect(r.messages).toEqual(["p.html: манифест различается и после сортировки preloads"]);
    expect(r.summary).toContain("манифест после сортировки: 0/1");
    expect(r.ok).toBe(false);
  });

  test("4) различие вне строки манифеста — строка с номерами A и B", () => {
    const m = manifestLine(ROOT);
    const r = dirs(base(page(m)), base(page(m, '<h1 class="text-3xl">Заголовок</h1>')));
    expect(r.messages).toEqual(["p.html: вне манифеста различается (строка манифеста A:3 B:3)"]);
    expect(r.summary).toContain("вне строки манифеста побайтно: 0/1");
    expect(r.ok).toBe(false);
  });

  test("5) строка манифеста на разных позициях — «вне манифеста различается»", () => {
    const m = manifestLine(ROOT);
    const a = ["<main>", '<h1 class="ui-h1">Заголовок</h1>', m, "</main>"].join("\n");
    const b = ["<main>", m, '<h1 class="ui-h1">Заголовок</h1>', "</main>"].join("\n");
    const r = dirs(base(a), base(b));
    expect(r.messages).toEqual(["p.html: вне манифеста различается (строка манифеста A:3 B:2)"]);
    expect(r.ok).toBe(false);
  });

  test("6) .preloads.txt различается — своя строка, preSame меньше", () => {
    const html = page(manifestLine(ROOT));
    const r = dirs(
      { "p.html": html, "p.preloads.txt": PRELOADS },
      { "p.html": html, "p.preloads.txt": "/assets/z-HASH.js\n" },
    );
    expect(r.messages).toEqual(["p.preloads.txt: .preloads.txt различается"]);
    expect(r.summary).toContain(".preloads.txt побайтно: 0/1");
    expect(r.ok).toBe(false);
  });

  test("7) состав каталогов различается — своя строка первой", () => {
    const html = page(manifestLine(ROOT));
    const r = dirs(base(html), { ...base(html), "q.html": html, "q.preloads.txt": PRELOADS });
    expect(r.messages[0]).toBe("состав каталогов различается: 2 против 4");
  });
});

// Код выхода процесса: 0 — совпало, 1 — расхождение, 2 — ошибка входа или
// вызова. Проверяется реальным запуском скрипта, а не возвращаемым значением:
// именно код процесса читает вызывающий (и раньше отсутствующий каталог давал
// тот же код 1, что и расхождение, — необработанным исключением).
describe("код выхода процесса", () => {
  const root = path.resolve(import.meta.dir, "..");
  const cli = (...args: string[]) => {
    const p = Bun.spawnSync([process.execPath, "scripts/snapshot-compare.ts", ...args], {
      cwd: root,
    });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };
  const snapDir = (files: Record<string, string>) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "snapcmp-"));
    for (const [n, t] of Object.entries(files)) fs.writeFileSync(path.join(d, n), t);
    return d;
  };
  const html = page(manifestLine(ROOT));

  test("8) каталоги совпали — код 0", () => {
    const a = snapDir(base(html));
    const b = snapDir(base(html));
    const r = cli(a, b);
    expect(r.out).toContain("вне строки манифеста побайтно: 1/1");
    expect(r.code).toBe(0);
  });

  test("9) расхождение — код 1", () => {
    const a = snapDir(base(html));
    const b = snapDir(base(page(manifestLine(ROOT), '<h1 class="text-3xl">Заголовок</h1>')));
    const r = cli(a, b);
    expect(r.out).toContain("вне строки манифеста побайтно: 0/1");
    expect(r.code).toBe(1);
  });

  test("10) отсутствующий каталог или аргумент — код 2, сообщение без стека", () => {
    const a = snapDir(base(html));
    const missing = cli(a, path.join(a, "нет-такого-каталога"));
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("нет каталога");
    expect(missing.err).not.toContain("ENOENT");
    const noArgs = cli();
    expect(noArgs.code).toBe(2);
    expect(noArgs.err).toContain("вызов:");
  });

  test("11) ни одного .html на любой стороне — код 2, а не «0/0» с кодом 0", () => {
    // Два пустых каталога совпадают «ни о чём»: сравнивать нечего — это
    // ошибка входа, а не успех.
    const empty = snapDir({});
    const bothEmpty = cli(empty, snapDir({}));
    expect(bothEmpty.code).toBe(2);
    expect(bothEmpty.err).toContain("нет ни одного .html");
    const oneSide = cli(snapDir(base(html)), empty);
    expect(oneSide.code).toBe(2);
    expect(oneSide.err).toContain("нет ни одного .html");
  });
});
