import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { compare, parseExpectations, type Region } from "./snapshot-align";
import {
  type CommitSpec,
  expectDirs,
  loadPlaces,
  locateDirs,
  parseCommits,
  parsePlaces,
  type Places,
  type ReadPage,
  SpecError,
} from "./snapshot-locate";

// Встроенной самопроверки у прежней версии (check.ts, md5 e792c22c) не было;
// случаи синтетические, по форме нормализованного снимка. Правило счёта —
// правило exp.ts: по строке идёт class="([^"]*)", вхождение засчитывается,
// если значение точно равно строке метки. Значения спецификации — без
// обёртки class="…".

const VALUE = "badge old";
const PLACES: Places = { "бейдж(старый)": [VALUE] };
const HIT = `<div class="${VALUE}">`;

const read =
  (pages: Record<string, string[]>): ReadPage =>
  (name) =>
    pages[name].join("\n");

const run = (pages: Record<string, string[]>, places: Places = PLACES) =>
  locateDirs(Object.keys(pages).sort(), read(pages), places);

const runExpect = (pages: Record<string, string[]>, commits: CommitSpec[]) =>
  expectDirs(Object.keys(pages).sort(), read(pages), commits);

const commit = (over: Partial<CommitSpec> = {}): CommitSpec => ({
  метка: "коммит 1",
  файл: "exp1.json",
  план: { p: 1 },
  места: PLACES,
  ...over,
});

describe("locateDirs — маркеры области", () => {
  test("1) маркеры на месте, вхождение внутри области", () => {
    const r = run({ "p.html": ["<html>", "<main>", HIT, "</main>", "</html>"] });
    expect(r.noStart).toBe(0);
    expect(r.noEnd).toBe(0);
    expect(r.badOrder).toBe(0);
    expect(r.lines).toContain("  p: бейдж(старый)=1; все вхождения в области: true");
    expect(r.lines).toContain(
      "страниц: 1; без начала «<main»: 0; без конца «</main>»: 0; неверный порядок: 0",
    );
    expect(r.exitCode).toBe(0);
  });

  test("2) нет начала области", () => {
    const r = run({ "p.html": ["<html>", HIT, "</main>", "</html>"] });
    expect(r.lines).toContain("  нет начала: p.html");
    expect(r.noStart).toBe(1);
    expect(r.exitCode).toBe(1);
  });

  test("3) нет конца области", () => {
    const r = run({ "p.html": ["<html>", "<main>", HIT, "</html>"] });
    expect(r.lines).toContain("  нет конца: p.html");
    expect(r.noEnd).toBe(1);
    expect(r.exitCode).toBe(1);
  });

  test("4) конец перед началом, второго конца нет — «нет конца», не «порядок»", () => {
    const r = run({ "p.html": ["<html>", "</main>", "<main>", HIT, "</html>"] });
    expect(r.lines).toContain("  нет конца: p.html");
    expect(r.noEnd).toBe(1);
    // Ветка «порядок» недостижима: конец ищется только после начала.
    expect(r.badOrder).toBe(0);
    expect(r.lines.some((l) => l.startsWith("  порядок:"))).toBe(false);
    expect(r.exitCode).toBe(1);
  });

  test("5) вхождение после </main> — вне области", () => {
    const r = run({ "p.html": ["<html>", "<main>", "<p>x</p>", "</main>", HIT, "</html>"] });
    expect(r.lines).toContain("  p: бейдж(старый)=1; все вхождения в области: false");
  });

  test("7) у метки две строки, каждая по разу на своей строке — 2", () => {
    const second = "badge new";
    const r = run(
      { "p.html": ["<html>", "<main>", HIT, `<div class="${second}">`, "</main>", "</html>"] },
      { бейдж: [VALUE, second] },
    );
    expect(r.totals).toEqual([2]);
  });

  test("8) страница без вхождений в вывод не попадает, числа сходятся", () => {
    const r = run({
      "p.html": ["<html>", "<main>", HIT, "</main>", "</html>"],
      "q.html": ["<html>", "<main>", "<p>x</p>", "</main>", "</html>"],
    });
    expect(r.lines.some((l) => l.startsWith("  q:"))).toBe(false);
    expect(r.pagesWithHits).toBe(1);
    expect(r.totals).toEqual([1]);
    expect(r.lines).toContain("страниц с вхождениями: 1; всего: бейдж(старый) 1");
  });
});

describe("недопустимая область — отказ", () => {
  test("23) нет начала — проблема с маркером начала и именем страницы", () => {
    const r = run({ "p.html": ["<html>", HIT, "</main>", "</html>"] });
    expect(r.lines).toContain("  маркер области не найден: начало «<main» — p.html");
    // Прежние строки и счётчики на месте, проблема их не заменяет.
    expect(r.lines).toContain("  нет начала: p.html");
  });

  test("24) нет конца — проблема с маркером конца и именем страницы", () => {
    const r = run({ "p.html": ["<html>", "<main>", HIT, "</html>"] });
    expect(r.lines).toContain("  маркер области не найден: конец «</main>» — p.html");
    expect(r.lines).toContain("  нет конца: p.html");
  });

  test("25) конец перед началом — та же проблема «конец»", () => {
    const r = run({ "p.html": ["<html>", "</main>", "<main>", HIT, "</html>"] });
    expect(r.lines).toContain("  маркер области не найден: конец «</main>» — p.html");
    expect(r.lines.some((l) => l.startsWith("  порядок:"))).toBe(false);
  });

  test("26) --expect засчитывает вхождение после </main> и выходит с 0", () => {
    // Областью --expect не ограничен и аргументов области не принимает.
    const r = runExpect({ "p.html": ["<main>", "</main>", HIT] }, [commit()]);
    expect(r.lines).toEqual(["коммит 1: страниц 1, строк по факту 1, расхождений 0"]);
    expect(r.exitCode).toBe(0);
  });
});

describe("правило счёта — точное значение class, каждое вхождение", () => {
  test("13) два элемента с одинаковой строкой классов в одной строке — 2", () => {
    const r = run({ "p.html": ["<html>", "<main>", `${HIT}${HIT}`, "</main>", "</html>"] });
    expect(r.totals).toEqual([2]);
  });

  test("14) искомая строка подстрокой более длинной строки классов — 0", () => {
    const r = run({
      "p.html": ["<html>", "<main>", `<div class="${VALUE} extra">`, "</main>", "</html>"],
    });
    expect(r.totals).toEqual([0]);
    expect(r.pagesWithHits).toBe(0);
  });

  test("15) значение в другом атрибуте засчитывается — названное ограничение", () => {
    // Границы имени атрибута у class="([^"]*)" нет: вхождение внутри значения
    // другого атрибута считается, ровно как у прежнего правила подстроки.
    // Разметка React такого не выдаёт — кавычки экранируются в &quot;.
    const r = run({
      "p.html": [
        "<html>",
        "<main>",
        `<div data-note='class="${VALUE}"' class="other">`,
        "</main>",
        "</html>",
      ],
    });
    expect(r.totals).toEqual([1]);
  });

  test('16) значение метки в обёртке class=" — отказ с подсказкой', () => {
    expect(() => parsePlaces('{"места":{"м":["class=\\"badge old\\""]}}')).toThrow(SpecError);
    expect(() => parsePlaces('{"места":{"м":["class=\\"badge old\\""]}}')).toThrow(
      /нужно значение атрибута без обёртки/,
    );
  });
});

describe("режим --expect", () => {
  test("17) план совпал с фактом", () => {
    const r = runExpect({ "p.html": ["<main>", HIT, "</main>"] }, [commit()]);
    expect(r.lines).toEqual(["коммит 1: страниц 1, строк по факту 1, расхождений 0"]);
    expect(r.exitCode).toBe(0);
  });

  test("18) план не совпал — страница, план и факт", () => {
    const r = runExpect({ "p.html": ["<main>", HIT, "</main>"] }, [commit({ план: { p: 2 } })]);
    expect(r.lines).toContain("  p: план 2, факт 1");
    expect(r.exitCode).toBe(1);
  });

  test("19) страницы плана нет в снимке", () => {
    const r = runExpect({ "p.html": ["<main>", HIT, "</main>"] }, [
      commit({ план: { p: 1, q: 3 } }),
    ]);
    expect(r.lines).toContain("  q: страницы нет в снимке");
    expect(r.exitCode).toBe(1);
  });

  test("20) записанный JSON: только ненулевой план, значение [N, 0], отступ 1", () => {
    const r = runExpect(
      {
        "p.html": ["<main>", HIT, "</main>"],
        "q.html": ["<main>", "<p>x</p>", "</main>"],
      },
      [commit({ план: { p: 1, q: 0 } })],
    );
    expect(r.files).toEqual([{ file: "exp1.json", json: '{\n "p": [\n  1,\n  0\n ]\n}' }]);
  });

  test("21) шаблон не того режима — отказ в обе стороны", () => {
    expect(() => parsePlaces('{"коммиты":[]}')).toThrow(SpecError);
    expect(() => parseCommits('{"места":{"м":["x"]}}')).toThrow(SpecError);
  });

  test("22) стык: файл --expect читается snapshot-align и даёт вердикт «по ожиданию»", () => {
    const region: Region = { start: "<main", end: "</main>" };
    const A = ["<html>", "<main>", HIT, "</main>", "<footer>"];
    const B = ["<html>", "<main>", '<div class="badge new">', "</main>", "<footer>"];
    const written = runExpect({ "p.html": A }, [commit()]).files[0].json;
    const exp = parseExpectations(written);
    expect(exp["p"]).toEqual([1, 0]);
    const v = compare(A, B, region);
    const [eC, eI] = exp["p"];
    expect(v.changed).toBe(eC);
    expect(v.inserted).toBe(eI);
    expect(v.deleted).toBe(0);
    expect(v.problems).toEqual([]);
  });
});

describe("спецификация — отказы", () => {
  test("9) файла нет — отказ", () => {
    const missing = path.join(os.tmpdir(), "snapshot-locate-нет-такого-файла.json");
    expect(() => loadPlaces(missing)).toThrow(SpecError);
  });

  test("10) пустой объект и пустое «места» — отказ", () => {
    expect(() => parsePlaces("{}")).toThrow(SpecError);
    expect(() => parsePlaces('{"места":{}}')).toThrow(SpecError);
  });

  test("11) неизвестный ключ верхнего уровня — отказ", () => {
    expect(() => parsePlaces('{"места":{"м":["x"]},"лишнее":1}')).toThrow(SpecError);
  });

  test("12) значение метки — не непустой массив непустых строк", () => {
    expect(() => parsePlaces('{"места":{"м":"x"}}')).toThrow(SpecError);
    expect(() => parsePlaces('{"места":{"м":[]}}')).toThrow(SpecError);
    expect(() => parsePlaces('{"места":{"м":[""]}}')).toThrow(SpecError);
    expect(() => parsePlaces('{"места":{"м":[1]}}')).toThrow(SpecError);
  });
});
