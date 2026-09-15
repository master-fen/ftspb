import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import { extract, inT1, inT2, inT3, readCss, T1, T2, T3 } from "./css-extract";

// Встроенной самопроверки у прежней версии (ext.pl, md5 ca162c6d) не было.
// Ожидания случаев с байтами сняты запуском старой версии и вписаны здесь
// литералами — perl тесты не вызывают. Байты задаются числами, а не
// escape-строками: запись через sed/perl портит \u и \\, а настоящий байт в
// исходнике делает файл двоичным для git.
//
// Вывод инструмента байтовый, поэтому сравнивается в байтовом виде: ожидаемый
// литерал переводится в него через lit(), сырые байты — через bytes().

/** Ожидаемый литерал (UTF-8) в байтовом виде. */
const lit = (s: string) => Buffer.from(s, "utf8").toString("latin1");
/** Байтовая строка из чисел: символ равен байту. */
const bytes = (...arr: number[]) => Buffer.from(arr).toString("latin1");
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const run = (css: string, ...args: string[]) => extract(css, args, "f.css").toString("latin1");

/** Временный файл из байтов — чтобы проверить и путь чтения. */
const tmpFile = (name: string, data: number[]) => {
  const file = path.join(os.tmpdir(), `css-extract-${name}-${process.pid}.css`);
  fs.writeFileSync(file, Buffer.from(data));
  return file;
};

describe("разбор правил", () => {
  test("1) селектор среди частей списка через запятую; чужой не найден", () => {
    const out = run(".a,.b{c:d}", ".b", ".zz");
    expect(out).toContain(lit("== .b — найдено: 1\n   .a,.b{c:d}\n"));
    expect(out).toContain(lit("== .zz — найдено: 0\n"));
  });

  test("2) правило внутри @layer utilities — контекст", () => {
    const out = run("@layer utilities{.a{b:c}}", ".a");
    expect(out).toContain(lit("== .a — найдено: 1\n   [@layer utilities] .a{b:c}\n"));
  });

  test("3) два уровня вложенности — контекст через « > »", () => {
    const out = run("@layer utilities{@media print{.a{b:c}}}", ".a");
    expect(out).toContain(lit("[@layer utilities > @media print] .a{b:c}"));
  });

  test("4) «}» внутри строки не закрывает блок", () => {
    const out = run('.a{content:"}";b:c}', ".a");
    expect(out).toContain(lit("== контроль разбора: глубина в конце 0, блоков 1\n"));
    expect(out).toContain(lit('.a{content:"}";b:c}'));
  });

  test("5) экранированный «\\}» вне строки не закрывает блок", () => {
    const out = run(".a{b:c\\}d}", ".a");
    expect(out).toContain(lit("== контроль разбора: глубина в конце 0, блоков 1\n"));
  });

  test("6) селектор с экранированным слэшем находится", () => {
    const out = run(".bg-white\\/10{a:b}", ".bg-white\\/10");
    expect(out).toContain(lit("== .bg-white\\/10 — найдено: 1\n"));
  });

  test("7) объявление: найдены все вхождения, по порядку", () => {
    const out = run(".a{--x:1}.b{--x:2}", "--x:");
    expect(out).toContain(lit("== объявление --x: — найдено: 2\n   @3: --x:1\n   @12: --x:2\n"));
  });
});

describe("байтовая семантика", () => {
  test("8) смещение @N байтовое: многобайтовая последовательность до места", () => {
    // .a{content:" — 12 байт, затем E2 80 94 (U+2014), затем "; — 2 байта,
    // значит --x:v начинается на байте 17. При чтении в utf8 было бы 15.
    const file = tmpFile("offset", [
      ...ascii('.a{content:"'),
      0xe2,
      0x80,
      0x94,
      ...ascii('";--x:v}'),
    ]);
    const out = extract(readCss(file), ["--x:v"], "f.css").toString("latin1");
    expect(out).toContain(lit("== объявление --x:v — найдено: 1\n   @17: --x:v\n"));
    fs.rmSync(file);
  });

  test("9) хвост файла — последние 300 байт, не символов", () => {
    // 3 байта последовательности + 299 ASCII = 302 байта. Хвост в байтах
    // начинается с байта 2 — с середины последовательности (0x94).
    const data = [0xe2, 0x80, 0x94, ...ascii(".a{b:c}"), ...ascii("x".repeat(292))];
    expect(data.length).toBe(302);
    const file = tmpFile("tail", data);
    const css = readCss(file);
    expect(css.length).toBe(302);
    const out = extract(css, [], "f.css").toString("latin1");
    expect(out).toContain(
      lit("== хвост файла (последние 300 символов):\n") +
        bytes(0x94) +
        ".a{b:c}" +
        "x".repeat(292) +
        "\n",
    );
    fs.rmSync(file);
  });

  test("13) класс применяется к байтам файла", () => {
    // Байт из T1 перед селектором подрезается, селектор находится; байт не из
    // T1 остаётся в заголовке, и селектор не находится. В T1 нет байта ≥ 0x80
    // (измерено), поэтому взят запасной 0x09 — этот тест смену режима чтения
    // файла не ловит, её ловят тесты 8 и 9 и развёртки S1-S4.
    const inClass = tmpFile("in-class", [0x09, ...ascii(".sel{a:b}")]);
    const outClass = tmpFile("out-class", [0x78, ...ascii(".sel{a:b}")]);
    expect(inT1(0x09)).toBe(true);
    expect(inT1(0x78)).toBe(false);
    expect(extract(readCss(inClass), [".sel"], "f.css").toString("latin1")).toContain(
      lit("== .sel — найдено: 1\n"),
    );
    expect(extract(readCss(outClass), [".sel"], "f.css").toString("latin1")).toContain(
      lit("== .sel — найдено: 0\n"),
    );
    fs.rmSync(inClass);
    fs.rmSync(outClass);
  });
});

describe("классы символов — таблицы, снятые с Perl", () => {
  // Измерено отдельным запуском Perl с теми же use-строками: chr(0..255)
  // против /\A\s\z/, /\A[\s}]\z/, /\A[;}]\z/. Косвенное измерение через
  // «селектор найден» дало бы ложную принадлежность байтов «,» и «}».
  const table = (members: number[], predicate: (b: number) => boolean) => {
    const set = new Set(members);
    const wrong: number[] = [];
    for (let b = 0; b < 256; b++) if (predicate(b) !== set.has(b)) wrong.push(b);
    return wrong;
  };

  test("10) T1 — \\s у Perl на байтах", () => {
    expect(T1).toEqual([9, 10, 11, 12, 13, 32]);
    expect(table(T1, inT1)).toEqual([]);
  });

  test("11) T2 — [\\s}]", () => {
    expect(T2).toEqual([9, 10, 11, 12, 13, 32, 125]);
    expect(table(T2, inT2)).toEqual([]);
  });

  test("12) T3 — [;}]", () => {
    expect(T3).toEqual([59, 125]);
    expect(table(T3, inT3)).toEqual([]);
  });
});

describe("«$» без /m и контроль LAST", () => {
  test("14) заголовок, оканчивающийся переводом строки", () => {
    const out = run(".sel \n{a:b}", ".sel");
    expect(out).toContain(lit("== .sel — найдено: 1\n"));
  });

  test("15) хвост, оканчивающийся переводом строки", () => {
    expect(run(".sel{a:b}\n", "LAST:.sel")).toContain(
      lit("== контроль LAST .sel — найдено 1, последнее правило файла: да\n"),
    );
    expect(run(".sel{a:b}\nx\n", "LAST:.sel")).toContain(
      lit("== контроль LAST .sel — найдено 1, последнее правило файла: НЕТ\n"),
    );
  });

  test("16) LAST: правило последнее — «да», не последнее — «НЕТ»", () => {
    expect(run(".a{b:c}", "LAST:.a")).toContain(
      lit("== контроль LAST .a — найдено 1, последнее правило файла: да\n"),
    );
    expect(run(".a{b:c}.z{y:x}", "LAST:.a")).toContain(
      lit("== контроль LAST .a — найдено 1, последнее правило файла: НЕТ\n"),
    );
  });
});
