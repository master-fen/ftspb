import fs from "node:fs";
import process from "node:process";

/**
 * Сверка форм правил: прежний класс против объявлений токена в собранном CSS.
 *
 * Запуск:
 *   bun scripts/css-rule-forms.ts ВЫБОРКА.txt CSS СПЕЦ.json
 *
 * ВЫБОРКА.txt — вывод scripts/css-extract.ts по CSS «до». СПЕЦ.json:
 *   { "пары":  [ { "форма": "A", "селектор": "…", "свойство": "…", "токен": "…" }, … ],
 *     "стопы": [ { "было": "…", "стало": "…", "свойства": ["…"] }, … ] }
 * Пары конкретного PR в репозиторий не коммитятся — они приходят
 * спецификацией, а инструмент печатает прочитанное.
 *
 * Ветка @supports прежнего класса обязана буквально совпасть с веткой
 * @supports токена (формы A, C, D) или с единственным значением (форма B);
 * фолбэк прежнего класса сверяется с фолбэком токена — факт, не стоп.
 */

/** Условие, которое Tailwind 4 ставит вокруг color-mix. Форма сборки, не данные PR. */
const SUP = "@supports (color:color-mix(in lab, red, red))";

export class SpecError extends Error {}

export type Form = "A" | "B" | "C" | "D";
export type Pair = { форма: Form; селектор: string; свойство: string; токен: string };
export type StopGroup = { было: string; стало: string; свойства: string[] };
export type FormsSpec = { пары: Pair[]; стопы: StopGroup[] };

const FORMS: Form[] = ["A", "B", "C", "D"];
const PAIR_KEYS = ["форма", "селектор", "свойство", "токен"];
const STOP_KEYS = ["было", "стало", "свойства"];

export function parseSpec(text: string, file = "спецификация"): FormsSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new SpecError(`${file}: не JSON — ${(err as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new SpecError(`${file}: спецификация должна быть объектом`);
  const root = parsed as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length === 0) throw new SpecError(`${file}: спецификация пуста`);
  for (const key of keys)
    if (key !== "пары" && key !== "стопы")
      throw new SpecError(`${file}: неизвестный ключ верхнего уровня «${key}»`);

  const pairs = root["пары"];
  if (!Array.isArray(pairs) || pairs.length === 0)
    throw new SpecError(`${file}: «пары» должно быть непустым массивом`);
  const пары = pairs.map((entry, i) => {
    const where = `пара ${i + 1}`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      throw new SpecError(`${file}: ${where} — не объект`);
    const e = entry as Record<string, unknown>;
    for (const key of Object.keys(e))
      if (!PAIR_KEYS.includes(key))
        throw new SpecError(`${file}: ${where}, неизвестный ключ «${key}»`);
    for (const key of PAIR_KEYS)
      if (typeof e[key] !== "string" || e[key] === "")
        throw new SpecError(`${file}: ${where}, «${key}» — не непустая строка`);
    if (!FORMS.includes(e["форма"] as Form))
      throw new SpecError(`${file}: ${where}, неизвестная форма «${e["форма"]}»`);
    return e as unknown as Pair;
  });

  const stops = root["стопы"] ?? [];
  if (!Array.isArray(stops)) throw new SpecError(`${file}: «стопы» должно быть массивом`);
  const стопы = stops.map((entry, i) => {
    const where = `группа стопов ${i + 1}`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      throw new SpecError(`${file}: ${where} — не объект`);
    const e = entry as Record<string, unknown>;
    for (const key of Object.keys(e))
      if (!STOP_KEYS.includes(key))
        throw new SpecError(`${file}: ${where}, неизвестный ключ «${key}»`);
    for (const key of ["было", "стало"])
      if (typeof e[key] !== "string" || e[key] === "")
        throw new SpecError(`${file}: ${where}, «${key}» — не непустая строка`);
    const props = e["свойства"];
    if (!Array.isArray(props) || props.length === 0 || props.some((p) => typeof p !== "string"))
      throw new SpecError(`${file}: ${where}, «свойства» — не непустой массив строк`);
    return e as unknown as StopGroup;
  });

  return { пары, стопы };
}

export function loadSpec(file: string): FormsSpec {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new SpecError(`${file}: файл спецификации не прочитан`);
  }
  return parseSpec(text, file);
}

export function specEcho(file: string, spec: FormsSpec): string[] {
  const out = [`спецификация ${file}: пар ${spec.пары.length}, групп стопов ${spec.стопы.length}`];
  for (const p of spec.пары) out.push(`  ${p.форма} ${p.селектор} ${p.свойство} → ${p.токен}`);
  for (const s of spec.стопы) out.push(`  стопы ${s.было} → ${s.стало}: ${s.свойства.join(", ")}`);
  return out;
}

export type Rule = { ctx: string; text: string };

/** Правила прежних классов из выборки: «== СЕЛЕКТОР — найдено: N» и строки «   [ctx] текст». */
export function parseSelection(text: string): Map<string, Rule[]> {
  const rules = new Map<string, Rule[]>();
  let cur: string | null = null;
  for (const l of text.split("\n")) {
    const h = /^== (\S+) — найдено: \d+$/.exec(l);
    if (h) {
      cur = h[1];
      rules.set(cur, []);
      continue;
    }
    if (l.startsWith("== ")) {
      cur = null;
      continue;
    }
    const r = /^ {3}\[([^\]]*)\] (.*)$/.exec(l);
    if (cur && r) rules.get(cur)!.push({ ctx: r[1], text: r[2] });
  }
  return rules;
}

/** Значение свойства в теле правила — по точному имени, не по подстроке. */
export function propValue(text: string, prop: string): string | null {
  const body = text.slice(text.indexOf("{") + 1, text.lastIndexOf("}"));
  for (const d of body.split(";")) {
    const i = d.indexOf(":");
    if (i > 0 && d.slice(0, i) === prop) return d.slice(i + 1);
  }
  return null;
}

export function oldBranches(rules: Map<string, Rule[]>, sel: string, prop: string) {
  const rs = rules.get(sel) ?? [];
  const withProp = rs.filter((r) => propValue(r.text, prop) !== null);
  const sup = withProp.find((r) => r.ctx.includes(SUP));
  const fb = withProp.find((r) => !r.ctx.includes(SUP));
  return {
    sup: sup ? propValue(sup.text, prop) : null,
    fb: fb ? propValue(fb.text, prop) : null,
    n: withProp.length,
  };
}

export function tokenDecls(css: string, name: string) {
  const out: { value: string; sup: boolean }[] = [];
  const needle = `--${name}:`;
  let p = -1;
  while ((p = css.indexOf(needle, p + 1)) >= 0) {
    const e = css.slice(p).search(/[;}]/);
    const value = css.slice(p + needle.length, p + e);
    const before = css.slice(Math.max(0, p - SUP.length - 10), p);
    out.push({ value, sup: before.includes(`${SUP}{:root{`) });
  }
  return out;
}

export type FormsResult = { lines: string[]; stops: number; exitCode: number };

export function checkForms(rules: Map<string, Rule[]>, css: string, spec: FormsSpec): FormsResult {
  const lines: string[] = [];
  let stop = 0;

  for (const { форма: form, селектор: sel, свойство: prop, токен: token } of spec.пары) {
    const o = oldBranches(rules, sel, prop);
    const t = tokenDecls(css, token);
    const tSup = t.find((d) => d.sup)?.value ?? null;
    const tFb = t.find((d) => !d.sup)?.value ?? null;
    if (form === "B") {
      const ok = o.n === 1 && t.length === 1 && o.fb === tFb;
      if (!ok) stop++;
      lines.push(
        `${form} ${sel} → ${token}: было ${prop}:${o.fb} | токен ${t.map((d) => d.value).join(" ; ")} | ` +
          `${ok ? "совпало" : "СТОП"}`,
      );
    } else {
      const supOk = o.sup !== null && o.sup === tSup;
      if (!supOk) stop++;
      const fbNote = o.fb === tFb ? "фолбэк совпал" : `фолбэк: было ${o.fb}, токен ${tFb}`;
      lines.push(
        `${form} ${sel} → ${token}: @supports было «${o.sup}», токен «${tSup}» — ` +
          `${supOk ? "совпало" : "СТОП"}; ${fbNote}`,
      );
    }
  }

  const stopsOld = (sel: string) =>
    (rules.get(sel) ?? [])
      .map((r) => r.text)
      .find((x) => x.includes("--tw-gradient-stops") || x.includes("--tw-gradient-via-stops"));
  const ruleNew = (sel: string) => {
    const i = css.indexOf(`${sel}{`);
    return i < 0 ? null : css.slice(i, css.indexOf("}", i) + 1);
  };

  for (const { было: o, стало: n, свойства: props } of spec.стопы) {
    const a = stopsOld(o);
    const b = ruleNew(n);
    for (const p of props) {
      const va = a ? propValue(a, p) : null;
      const vb = b ? propValue(b, p) : null;
      const ok = va !== null && va === vb;
      if (!ok) stop++;
      lines.push(
        `D стопы ${o} → ${n} ${p}: ${ok ? "совпало" : `СТОП: было «${va}», после «${vb}»`}`,
      );
    }
  }

  lines.push(`пар: ${spec.пары.length}; стопов: ${stop}`);
  return { lines, stops: stop, exitCode: stop ? 1 : 0 };
}

if (import.meta.main) {
  const [basePath, cssPath, specPath] = process.argv.slice(2);
  let spec: FormsSpec;
  try {
    spec = loadSpec(specPath);
  } catch (err) {
    if (!(err instanceof SpecError)) throw err;
    console.error(`Отказ: ${err.message}`);
    process.exit(2);
  }
  for (const line of specEcho(specPath, spec)) console.log(line);
  const rules = parseSelection(fs.readFileSync(basePath, "utf8"));
  const css = fs.readFileSync(cssPath, "utf8");
  const result = checkForms(rules, css, spec);
  for (const line of result.lines) console.log(line);
  process.exit(result.exitCode);
}
