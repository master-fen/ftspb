import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  checkForms,
  type FormsSpec,
  loadSpec,
  oldBranches,
  parseSelection,
  parseSpec,
  propValue,
  SpecError,
} from "./css-rule-forms";

// Встроенной самопроверки у прежней версии (forms.js, md5 5fc77dfa) не было;
// случаи синтетические, по форме вывода css-extract и собранного CSS Tailwind 4.

const SUP = "@supports (color:color-mix(in lab, red, red))";
const MIX = "color-mix(in oklab, var(--brand-blue) 10%, transparent)";

/** Выборка в форме вывода css-extract. */
const selection = (name: string, rules: [string, string][]) =>
  [
    "== файл: f.css",
    `== ${name} — найдено: ${rules.length}`,
    ...rules.map(([ctx, text]) => `   [${ctx}] ${text}`),
  ].join("\n");

/** CSS с объявлением токена в :root и, возможно, в ветке @supports. */
const cssWith = (fallback: string, supports?: string) =>
  `:root{${fallback}}` + (supports === undefined ? "" : `${SUP}{:root{${supports}}}`);

const pair = (over: Partial<FormsSpec["пары"][0]> = {}): FormsSpec["пары"][0] => ({
  форма: "A",
  селектор: ".x",
  свойство: "border-color",
  токен: "tok",
  ...over,
});

const spec = (over: Partial<FormsSpec> = {}): FormsSpec => ({
  пары: [pair()],
  стопы: [],
  ...over,
});

const bothBranches = selection(".x", [
  ["@layer utilities", `.x{border-color:#fff}`],
  [`${SUP} > @layer utilities`, `.x{border-color:${MIX}}`],
]);

describe("разбор выборки и значений", () => {
  test("1) разбор выборки: заголовки и строки правил", () => {
    const rules = parseSelection(bothBranches);
    expect(rules.get(".x")).toEqual([
      { ctx: "@layer utilities", text: ".x{border-color:#fff}" },
      { ctx: `${SUP} > @layer utilities`, text: `.x{border-color:${MIX}}` },
    ]);
  });

  test("2) значение свойства — по точному имени, не по подстроке", () => {
    const text = ".x{border-color-x:1;border-color:2}";
    expect(propValue(text, "border-color")).toBe("2");
    expect(propValue(text, "border")).toBeNull();
  });
});

describe("форма A", () => {
  test("3) ветка @supports совпала — «совпало», стопов 0", () => {
    const r = checkForms(
      parseSelection(bothBranches),
      cssWith("--tok:#fff", `--tok:${MIX}`),
      spec(),
    );
    expect(r.stops).toBe(0);
    expect(r.lines[0]).toBe(
      `A .x → tok: @supports было «${MIX}», токен «${MIX}» — совпало; фолбэк совпал`,
    );
    expect(r.exitCode).toBe(0);
    // Ветка и фолбэк прежнего класса различаются по контексту, а не по порядку.
    const o = oldBranches(parseSelection(bothBranches), ".x", "border-color");
    expect(o).toEqual({ sup: MIX, fb: "#fff", n: 2 });
  });

  test("4) ветка @supports не совпала — «СТОП», стопов 1", () => {
    const r = checkForms(parseSelection(bothBranches), cssWith("--tok:#fff", "--tok:иное"), spec());
    expect(r.stops).toBe(1);
    expect(r.lines[0]).toContain("— СТОП;");
    expect(r.exitCode).toBe(1);
  });

  test("5) у прежнего класса ветки @supports нет — «СТОП»", () => {
    const only = selection(".x", [["@layer utilities", ".x{border-color:#fff}"]]);
    const r = checkForms(parseSelection(only), cssWith("--tok:#fff", `--tok:${MIX}`), spec());
    expect(r.stops).toBe(1);
    expect(r.lines[0]).toContain("@supports было «null»");
  });

  test("8) фолбэк различается при совпавшей ветке — факт, не стоп", () => {
    const r = checkForms(
      parseSelection(bothBranches),
      cssWith("--tok:#eee", `--tok:${MIX}`),
      spec(),
    );
    expect(r.stops).toBe(0);
    expect(r.lines[0]).toContain("совпало; фолбэк: было #fff, токен #eee");
  });
});

describe("форма B", () => {
  const one = selection(".x", [["@layer utilities", ".x{background-color:#fff}"]]);
  const pairB = pair({ форма: "B", свойство: "background-color" });

  test("6) одно объявление у класса и у токена, фолбэк совпал — «совпало»", () => {
    const r = checkForms(parseSelection(one), cssWith("--tok:#fff"), spec({ пары: [pairB] }));
    expect(r.stops).toBe(0);
    expect(r.lines[0]).toBe("B .x → tok: было background-color:#fff | токен #fff | совпало");
  });

  test("7) у токена два объявления — «СТОП»", () => {
    const r = checkForms(
      parseSelection(one),
      cssWith("--tok:#fff", "--tok:#fff"),
      spec({ пары: [pairB] }),
    );
    expect(r.stops).toBe(1);
    expect(r.lines[0]).toContain("| СТОП");
  });
});

describe("форма D — стопы градиента", () => {
  // Пара в спецификации взята заведомо совпадающая: иначе её собственный стоп
  // попал бы в общий счёт и тест перестал бы мерить только группу стопов.
  const grad = [
    selection(".from-x", [["@layer utilities", ".from-x{--tw-gradient-stops:A,B}"]]),
    "== .b — найдено: 1",
    "   [@layer utilities] .b{background-color:#fff}",
  ].join("\n");
  const gradCss = (stopsValue: string) =>
    `:root{--tokb:#fff}.from-y{--tw-gradient-stops:${stopsValue}}`;
  const stops = (стало: string): FormsSpec => ({
    пары: [pair({ форма: "B", селектор: ".b", свойство: "background-color", токен: "tokb" })],
    стопы: [{ было: ".from-x", стало, свойства: ["--tw-gradient-stops"] }],
  });

  test("9) стопы совпали и не совпали", () => {
    const ok = checkForms(parseSelection(grad), gradCss("A,B"), stops(".from-y"));
    expect(ok.lines[1]).toBe("D стопы .from-x → .from-y --tw-gradient-stops: совпало");
    expect(ok.stops).toBe(0);

    const bad = checkForms(parseSelection(grad), gradCss("C"), stops(".from-y"));
    expect(bad.lines[1]).toBe(
      "D стопы .from-x → .from-y --tw-gradient-stops: СТОП: было «A,B», после «C»",
    );
    expect(bad.stops).toBe(1);
  });
});

describe("спецификация — отказы", () => {
  test("10) файла нет, пустая спецификация, пустые «пары»", () => {
    expect(() => loadSpec(path.join(os.tmpdir(), "css-rule-forms-нет-файла.json"))).toThrow(
      SpecError,
    );
    expect(() => parseSpec("{}")).toThrow(SpecError);
    expect(() => parseSpec('{"пары":[]}')).toThrow(SpecError);
  });

  test("11) неизвестный ключ пары и неизвестная форма", () => {
    expect(() =>
      parseSpec('{"пары":[{"форма":"A","селектор":".x","свойство":"p","токен":"t","лишнее":1}]}'),
    ).toThrow(SpecError);
    expect(() =>
      parseSpec('{"пары":[{"форма":"Z","селектор":".x","свойство":"p","токен":"t"}]}'),
    ).toThrow(SpecError);
    expect(() => parseSpec('{"пары":[{"форма":"A"}],"лишнее":1}')).toThrow(SpecError);
  });
});
