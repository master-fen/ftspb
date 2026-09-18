import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import { compare, DEFAULT_REGION, type Region } from "./snapshot-align";

// Шесть случаев прежней встроенной самопроверки strip3 (#81), один к одному:
// те же входы и те же ожидания. Случай 5 — фикстура по форме реальных данных
// #79, переписанная синтетически: маркер области в ней заменён на
// «<div class="c-region">», а три числа ожидания сняты прогоном прежней версии
// на этом новом входе (1 изменённая, 7 вставок, 0 удалений).

const MANIFEST = '<script class="$tsr" id="$tsr-stream-barrier">';
const M1 = `${MANIFEST}x preloads:$R[1]=["/a.js","/b.js"]`;
const M2 = `${MANIFEST}x preloads:$R[1]=["/a.js","/b.js","/c.js"]`;

const A = [
  "<html>",
  M1,
  "<main>",
  DEFAULT_REGION.start,
  '<h1 class="x">',
  '<nav class="p">',
  "</nav>",
  "</div>",
  "</main>",
  "<footer>",
];

const B = [
  "<html>",
  M1,
  "<main>",
  DEFAULT_REGION.start,
  '<h1 class="x">',
  '<button class="s">',
  "</button>",
  '<nav class="q">',
  "</nav>",
  "</div>",
  "</main>",
  "<footer>",
];

// Случай 5: перед блоком X вставлен блок S (как селектор под заголовком), в X
// сменён class одной строки (как у панели), сразу за X вставлен блок Y, у
// которого после опустошения class совпадает с X хвост из нескольких строк
// (как у блока «Ещё» и панели меню). Ожидание: 1 изменённая, 7 вставок
// (S 2 + Y 5), 0 удалений.
const CASE5_REGION: Region = { start: '<div class="c-region">', end: "</main>" };
const M = `${MANIFEST}x preloads:$R[1]=["/a.js"]`;

const CASE5_A = [
  "<html>",
  M,
  "<main>",
  CASE5_REGION.start,
  "<h1>",
  '<nav class="p">',
  '<li class="r">',
  '<a href="/a" class="k">A</a>',
  "</li>",
  '<li class="r">',
  '<a href="/b" class="k">B</a>',
  "</li>",
  "</nav>",
  "</div>",
  "</main>",
  "<footer>",
];

const CASE5_B = [
  "<html>",
  M,
  "<main>",
  CASE5_REGION.start,
  "<h1>",
  '<button class="s">',
  "</button>",
  '<nav class="p2">',
  '<li class="r">',
  '<a href="/a" class="k">A</a>',
  "</li>",
  '<li class="r">',
  '<a href="/b" class="k">B</a>',
  "</li>",
  "</nav>",
  '<nav class="y">',
  '<li class="m">',
  '<a href="/b" class="n">B</a>',
  "</li>",
  "</nav>",
  "</div>",
  "</main>",
  "<footer>",
];

describe("compare", () => {
  test("1) положительная: изменён class, две вставки, проблем нет", () => {
    const v = compare(A, B);
    expect(v.changed).toBe(1);
    expect(v.inserted).toBe(2);
    expect(v.deleted).toBe(0);
    expect(v.problems).toEqual([]);
  });

  test("2) вставка после </main> — проблема «вставка вне области»", () => {
    const v = compare(A, [...B.slice(0, 11), '<span class="z">', "<footer>"]);
    expect(v.problems.some((x) => x.startsWith("вставка вне"))).toBe(true);
  });

  test("3) строка A без пары — проблема «удалена строка»", () => {
    const v = compare(
      A,
      B.filter((l) => l !== "<footer>"),
    );
    expect(v.problems.some((x) => x.startsWith("удалена"))).toBe(true);
  });

  test("4) состав манифеста: добавлен /c.js, проблем нет", () => {
    const v = compare(
      A,
      B.map((l) => (l === M1 ? M2 : l)),
    );
    expect(v.manifestComposition?.added.join()).toBe('"/c.js"');
    expect(v.problems).toEqual([]);
  });

  test("5) повторяющийся хвост, форма реальных данных #79", () => {
    const v = compare(CASE5_A, CASE5_B, CASE5_REGION);
    expect(v.changed).toBe(1);
    expect(v.inserted).toBe(7);
    expect(v.deleted).toBe(0);
    expect(v.problems).toEqual([]);
  });

  test("6) ненайденный маркер области — отказ, а не россыпь «вне области»", () => {
    const end = "</нет-такого-маркера>";
    const v = compare(A, B, { start: DEFAULT_REGION.start, end });
    expect(v.problems.length).toBe(1);
    expect(v.problems[0].startsWith("маркер области не найден")).toBe(true);
    expect(v.problems[0]).toContain(end);
    expect(v.problems.some((x) => x.startsWith("изменён class вне области"))).toBe(false);
  });
});

// Код выхода процесса: 0 — по ожиданию, 1 — расхождение, 2 — ошибка входа или
// вызова. Проверяется реальным запуском скрипта: раньше отсутствующий каталог
// или файл ожиданий давал тот же код 1, что и расхождение, — необработанным
// исключением.
describe("код выхода процесса", () => {
  const root = path.resolve(import.meta.dir, "..");
  const cli = (...args: string[]) => {
    const p = Bun.spawnSync([process.execPath, "scripts/snapshot-align.ts", ...args], {
      cwd: root,
    });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };
  const tmp = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `snapalign-${name}-`));
  const snapDir = (lines: string[]) => {
    const d = tmp("dir");
    fs.writeFileSync(path.join(d, "p.html"), lines.join("\n"));
    return d;
  };
  const expFile = (json: string) => {
    const f = path.join(tmp("exp"), "exp.json");
    fs.writeFileSync(f, json);
    return f;
  };
  const PAGE = [DEFAULT_REGION.start, '<p class="x">т</p>', DEFAULT_REGION.end];

  test("7) страницы по ожиданию — код 0", () => {
    const r = cli(snapDir(PAGE), snapDir(PAGE), expFile("{}"));
    expect(r.out).toContain("с расхождением: 0");
    expect(r.code).toBe(0);
  });

  test("8) вставка вне области при пустом ожидании — код 1", () => {
    const r = cli(snapDir(PAGE), snapDir(["<nav>лишнее</nav>", ...PAGE]), expFile("{}"));
    expect(r.out).toContain("с расхождением: 1");
    expect(r.code).toBe(1);
  });

  test("9) нет каталога, нет файла ожиданий, нет аргументов — код 2, без стека", () => {
    const a = snapDir(PAGE);
    const noDir = cli(a, path.join(a, "нет-такого"), expFile("{}"));
    expect(noDir.code).toBe(2);
    expect(noDir.err).toContain("нет каталога");
    expect(noDir.err).not.toContain("ENOENT");
    const noExp = cli(a, snapDir(PAGE), path.join(a, "нет.json"));
    expect(noExp.code).toBe(2);
    expect(noExp.err).toContain("нет файла ожиданий");
    const noArgs = cli();
    expect(noArgs.code).toBe(2);
    expect(noArgs.err).toContain("вызов:");
  });
});
