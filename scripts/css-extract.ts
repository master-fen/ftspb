import { Buffer } from "node:buffer";
import fs from "node:fs";
import process from "node:process";

/**
 * Выборка правил из собранного CSS одним вызовом.
 *
 * Запуск:
 *   bun scripts/css-extract.ts ФАЙЛ.css СЕЛЕКТОР… [LAST:СЕЛЕКТОР] [--объявление…]
 *
 * СЕЛЕКТОР — точный текст из CSS (с экранированием), сравнивается с каждой
 * частью списка селекторов через запятую. Аргумент на «--» — поиск объявления
 * подстрокой. LAST: — селектор последнего правила файла: контроль самого
 * извлекателя, правило обязано найтись и стоять в конце файла.
 * Разбор: «\» вне и внутри строк — экранирование, строки "…"/'…' — без скобок.
 *
 * Семантика байтовая, как у прежней версии на Perl с ':raw': вход читается
 * байтами (latin1, байт равен символу), смещения и хвост считаются в байтах,
 * вывод собирается из кусков — литералы в UTF-8, куски CSS и аргументы байтами.
 * Классы символов заданы явными списками байтов, а не \s: у Perl на байтах и у
 * JS на строке это разные классы — неразрывный пробел (байт 0xA0) матчится JS и
 * не матчится Perl. Списки измерены отдельным запуском Perl с теми же
 * use-строками на chr(0..255) через /\A…\z/. Косвенное измерение «селектор
 * найден» дало бы ложную принадлежность: байт «,» при разбиении заголовка по
 * запятой даёт пустую часть и сам селектор, «}» закрывает блок.
 */

/** \s у Perl на байтах: HT, LF, VT, FF, CR, пробел. */
export const T1 = [9, 10, 11, 12, 13, 32];
/** [\s}] — то же плюс «}». */
export const T2 = [9, 10, 11, 12, 13, 32, 125];
/** [;}] — «;» и «}». */
export const T3 = [59, 125];

const S1 = new Set(T1);
const S2 = new Set(T2);
const S3 = new Set(T3);

export const inT1 = (byte: number) => S1.has(byte);
export const inT2 = (byte: number) => S2.has(byte);
export const inT3 = (byte: number) => S3.has(byte);

/** Perl: $h =~ s/^\s+|\s+$//g — снимает ведущий и хвостовой прогон класса T1. */
export function trimHeader(h: string): string {
  let a = 0;
  let b = h.length;
  while (a < b && inT1(h.charCodeAt(a))) a++;
  while (b > a && inT1(h.charCodeAt(b - 1))) b--;
  return h.slice(a, b);
}

const allT2 = (s: string) => {
  for (let i = 0; i < s.length; i++) if (!inT2(s.charCodeAt(i))) return false;
  return true;
};

/**
 * Perl: /^[\s}]*$/ без /m. «^» — начало строки, «$» — конец строки ИЛИ позиция
 * перед последним переводом строки; у JS «$» без /m только конец, поэтому
 * вторая позиция проверяется отдельно.
 */
export function tailAllT2(tail: string): boolean {
  if (tail.length > 0 && tail.charCodeAt(tail.length - 1) === 10)
    if (allT2(tail.slice(0, tail.length - 1))) return true;
  return allT2(tail);
}

type Rule = { ctx: string; text: string; end: number };

/** Литерал вывода — в UTF-8. */
const lit = (s: string) => Buffer.from(s, "utf8");
/** Байтовая строка (CSS или аргумент) — как есть. */
const raw = (s: string) => Buffer.from(s, "latin1");

/** Полный вывод в байтах. css и args — байтовые строки: символ равен байту. */
export function extract(css: string, args: string[], file: string): Buffer {
  const sels = args.filter((a) => !a.startsWith("--") && !a.startsWith("LAST:"));
  const decls = args.filter((a) => a.startsWith("--"));
  const lastArg = args.find((a) => a.startsWith("LAST:"));
  const last = lastArg === undefined ? undefined : lastArg.slice(5);

  const want = new Map<string, Rule[]>();
  for (const s of sels) if (!want.has(s)) want.set(s, []);
  if (last !== undefined && !want.has(last)) want.set(last, []);

  const open: [string, number][] = [];
  let instr: string | null = null;
  let i = 0;
  let hs = 0;
  let blocks = 0;
  const n = css.length;

  while (i < n) {
    const c = css[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (instr !== null) {
      if (c === instr) instr = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      instr = c;
      i++;
      continue;
    }
    if (c === "{") {
      open.push([trimHeader(css.slice(hs, i)), i]);
      hs = i + 1;
    } else if (c === "}") {
      const top = open.pop();
      blocks++;
      if (top) {
        const [h, bs] = top;
        const parts = new Set(h.split(","));
        for (const [s, list] of want)
          if (parts.has(s))
            list.push({
              ctx: open.map((o) => o[0]).join(" > "),
              text: h + css.slice(bs, i + 1),
              end: i,
            });
      }
      hs = i + 1;
    } else if (c === ";") {
      hs = i + 1;
    }
    i++;
  }

  const out: Buffer[] = [];
  const pushRule = (r: Rule) => {
    out.push(lit("   "));
    if (r.ctx) out.push(lit("["), raw(r.ctx), lit("] "));
    out.push(raw(r.text), lit("\n"));
  };

  out.push(lit("== файл: "), raw(file), lit("\n"));
  for (const s of sels) {
    const m = want.get(s)!;
    out.push(lit("== "), raw(s), lit(` — найдено: ${m.length}\n`));
    for (const r of m) pushRule(r);
  }
  for (const d of decls) {
    const pos: number[] = [];
    let p = -1;
    while ((p = css.indexOf(d, p + 1)) >= 0) pos.push(p);
    out.push(lit("== объявление "), raw(d), lit(` — найдено: ${pos.length}\n`));
    for (const q of pos) {
      let e = q;
      while (e < n && !inT3(css.charCodeAt(e))) e++;
      out.push(lit(`   @${q}: `), raw(css.slice(q, e)), lit("\n"));
    }
  }
  out.push(lit(`== контроль разбора: глубина в конце ${open.length}, блоков ${blocks}\n`));
  out.push(
    lit("== хвост файла (последние 300 символов):\n"),
    raw(css.slice(n > 300 ? n - 300 : 0)),
    lit("\n"),
  );
  if (last !== undefined) {
    const m = want.get(last)!;
    let ok = false;
    for (const r of m) if (tailAllT2(css.slice(r.end + 1))) ok = true;
    out.push(
      lit("== контроль LAST "),
      raw(last),
      lit(` — найдено ${m.length}, последнее правило файла: ${ok ? "да" : "НЕТ"}\n`),
    );
    for (const r of m) pushRule(r);
  }
  return Buffer.concat(out);
}

/** Аргумент из argv (UTF-8) в байтовую строку. */
const toBytes = (s: string) => Buffer.from(s, "utf8").toString("latin1");

/** Чтение CSS байтами: символ равен байту. Смещения и хвост считаются по ней. */
export function readCss(file: string): string {
  return fs.readFileSync(file).toString("latin1");
}

if (import.meta.main) {
  const [file, ...rawArgs] = process.argv.slice(2);
  let css: string;
  try {
    css = readCss(file);
  } catch {
    process.stderr.write(lit(`нет файла ${file}\n`));
    process.exit(2);
  }
  process.stdout.write(extract(css, rawArgs.map(toBytes), toBytes(file)));
}
