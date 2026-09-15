import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import type { Expectations } from "./snapshot-align";

/**
 * Локатор мест по снимку и проверка маркеров области.
 *
 * Запуск:
 *   bun scripts/snapshot-locate.ts КАТАЛОГ СПЕЦ.json [НАЧАЛО КОНЕЦ]
 *   bun scripts/snapshot-locate.ts --expect КАТАЛОГ СПЕЦ.json КАТАЛОГ_ВЫВОДА
 *
 * СПЕЦ.json обычного режима: { "места": { "МЕТКА": ["значение class", …], … } }.
 * СПЕЦ.json режима --expect: { "коммиты": [ { "метка", "файл", "план", "места" }, … ] }.
 * Строки конкретного PR в репозиторий не коммитятся — они приходят
 * спецификацией, а инструмент печатает прочитанное, чтобы в докладе было видно,
 * что проверялось.
 *
 * Правило счёта одно на оба режима: по строке идёт class="([^"]*)", вхождение
 * засчитывается метке, если захваченное значение точно равно одной из её строк;
 * каждое вхождение считается отдельно. Границы имени атрибута у выражения нет:
 * строка class="…" внутри значения другого атрибута тоже засчитается. Разметка
 * React такого не выдаёт — кавычки в значениях и в тексте она экранирует в
 * &quot;. Разбор атрибутов здесь не делается намеренно: он развёл бы --expect с
 * прежней версией, и побайтное совпадение на реальных данных перестало бы
 * что-либо доказывать.
 *
 * Обычный режим ещё проверяет маркеры области: нет начала или нет конца после
 * начала — проблема отдельной строкой и код выхода 1; прежние строки и
 * счётчики при этом печатаются как раньше. --expect области не знает и
 * считает по всей странице.
 */

export type Places = Record<string, string[]>;
export type Region = { start: string; end: string };

export const DEFAULT_REGION: Region = { start: "<main", end: "</main>" };

export class SpecError extends Error {}

const CLASS_VALUE = /class="([^"]*)"/g;

// ───────────────────────── спецификация ─────────────────────────

function parseRoot(text: string, file: string, expected: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new SpecError(`${file}: не JSON — ${(err as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new SpecError(`${file}: спецификация должна быть объектом`);
  const keys = Object.keys(parsed);
  if (keys.length === 0) throw new SpecError(`${file}: спецификация пуста`);
  const other = expected === "места" ? "коммиты" : "места";
  for (const key of keys) {
    if (key === expected) continue;
    if (key === other)
      throw new SpecError(
        `${file}: спецификация с ключом «${other}» — не для этого режима, ожидается «${expected}»`,
      );
    throw new SpecError(`${file}: неизвестный ключ верхнего уровня «${key}»`);
  }
  return parsed as Record<string, unknown>;
}

function parsePlacesValue(value: unknown, file: string, where: string): Places {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new SpecError(`${file}: ${where} должно быть объектом «метка → строки»`);
  const entries = Object.entries(value);
  if (entries.length === 0) throw new SpecError(`${file}: ${where} пусто`);
  const out: Places = {};
  for (const [label, values] of entries) {
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some((v) => typeof v !== "string" || v === "")
    )
      throw new SpecError(`${file}: значение метки «${label}» — не непустой массив непустых строк`);
    for (const v of values as string[])
      if (v.startsWith('class="'))
        throw new SpecError(
          `${file}: значение метки «${label}» начинается с class=" — нужно значение атрибута ` +
            `без обёртки, например rounded-md bg-brand-navy`,
        );
    out[label] = values as string[];
  }
  return out;
}

/** Спецификация обычного режима. */
export function parsePlaces(text: string, file = "спецификация"): Places {
  const root = parseRoot(text, file, "места");
  return parsePlacesValue(root["места"], file, "«места»");
}

export type CommitSpec = {
  метка: string;
  файл: string;
  план: Record<string, number>;
  места: Places;
};

/** Спецификация режима --expect. */
export function parseCommits(text: string, file = "спецификация"): CommitSpec[] {
  const root = parseRoot(text, file, "коммиты");
  const list = root["коммиты"];
  if (!Array.isArray(list) || list.length === 0)
    throw new SpecError(`${file}: «коммиты» должно быть непустым массивом записей`);
  return list.map((entry, i) => {
    const where = `запись ${i + 1}`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      throw new SpecError(`${file}: ${where} — не объект`);
    const e = entry as Record<string, unknown>;
    for (const key of Object.keys(e))
      if (!["метка", "файл", "план", "места"].includes(key))
        throw new SpecError(`${file}: ${where}, неизвестный ключ «${key}»`);
    for (const key of ["метка", "файл"])
      if (typeof e[key] !== "string" || e[key] === "")
        throw new SpecError(`${file}: ${where}, «${key}» — не непустая строка`);
    const plan = e["план"];
    if (typeof plan !== "object" || plan === null || Array.isArray(plan))
      throw new SpecError(`${file}: ${where}, «план» должен быть объектом «страница → число»`);
    for (const [page, n] of Object.entries(plan))
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0)
        throw new SpecError(
          `${file}: ${where}, план страницы «${page}» — не целое неотрицательное`,
        );
    return {
      метка: e["метка"] as string,
      файл: e["файл"] as string,
      план: plan as Record<string, number>,
      места: parsePlacesValue(e["места"], file, `${where}, «места»`),
    };
  });
}

export function loadSpecText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    throw new SpecError(`${file}: файл спецификации не прочитан`);
  }
}

export function loadPlaces(file: string): Places {
  return parsePlaces(loadSpecText(file), file);
}

export function loadCommits(file: string): CommitSpec[] {
  return parseCommits(loadSpecText(file), file);
}

/** Эхо прочитанной спецификации: по строке на каждую искомую строку метки. */
export function specEcho(file: string, places: Places): string[] {
  const out = [`спецификация ${file}: меток ${Object.keys(places).length}`];
  for (const [label, values] of Object.entries(places))
    for (const value of values) out.push(`  ${label}: ${value}`);
  return out;
}

export function commitsEcho(file: string, commits: CommitSpec[]): string[] {
  const out = [`спецификация ${file}: записей ${commits.length}`];
  for (const c of commits) {
    out.push(
      `  ${c.метка} → ${c.файл}: страниц в плане ${Object.keys(c.план).length}, ` +
        `меток ${Object.keys(c.места).length}`,
    );
    for (const [label, values] of Object.entries(c.места))
      for (const value of values) out.push(`    ${label}: ${value}`);
  }
  return out;
}

// ───────────────────────── счёт вхождений ─────────────────────────

/**
 * Вхождения по меткам: на каждое — индекс метки и номер строки. Один источник
 * чисел для обоих режимов.
 */
export function occurrences(src: string[], needles: string[][]): { label: number; line: number }[] {
  const out: { label: number; line: number }[] = [];
  for (let i = 0; i < src.length; i++)
    for (const m of src[i].matchAll(CLASS_VALUE))
      for (let k = 0; k < needles.length; k++)
        if (needles[k].includes(m[1])) out.push({ label: k, line: i });
  return out;
}

// ───────────────────────── обычный режим ─────────────────────────

export type LocateResult = {
  /** Всё, что печатается, в порядке печати. */
  lines: string[];
  noStart: number;
  noEnd: number;
  badOrder: number;
  pagesWithHits: number;
  totals: number[];
  exitCode: number;
};

/** Чтение страницы снимка по имени файла. */
export type ReadPage = (name: string) => string;

export function locateDirs(
  names: string[],
  read: ReadPage,
  places: Places,
  region: Region = DEFAULT_REGION,
): LocateResult {
  const labels = Object.keys(places);
  const needles = labels.map((label) => places[label]);
  const lines: string[] = [];
  let noStart = 0;
  let noEnd = 0;
  let badOrder = 0;
  const hits: Record<string, number[]> = {};

  for (const name of names) {
    const src = read(name).split("\n");
    const s = src.findIndex((l) => l.startsWith(region.start));
    // Конец ищется только среди строк ПОСЛЕ начала, поэтому e > s всегда, когда
    // оба найдены, а при s = -1 условие i > -1 истинно для всех строк. Ветка
    // «порядок» ниже из-за этого недостижима; переставленные маркеры дают
    // «нет конца». Строка и счётчик оставлены: они часть формата вывода
    // прежней версии, и на них держится сверка эквивалентности.
    const e = src.findIndex((l, i) => i > s && l.startsWith(region.end));
    if (s < 0) {
      noStart++;
      lines.push(`  нет начала: ${name}`);
      lines.push(`  маркер области не найден: начало «${region.start}» — ${name}`);
    }
    if (e < 0) {
      noEnd++;
      lines.push(`  нет конца: ${name}`);
      lines.push(`  маркер области не найден: конец «${region.end}» — ${name}`);
    }
    if (s >= 0 && e >= 0 && !(e > s)) {
      badOrder++;
      lines.push(`  порядок: ${name}`);
    }
    const page = name.replace(/\.html$/, "");
    const occ = occurrences(src, needles);
    const counts = needles.map((_, k) => occ.filter((o) => o.label === k).length);
    const inRegion = needles.map((_, k) =>
      occ.every((o) => o.label !== k || (o.line > s && o.line < e)),
    );
    if (counts.some((c) => c > 0)) {
      hits[page] = counts;
      lines.push(
        `  ${page}: ${labels.map((label, i) => `${label}=${counts[i]}`).join(" ")}; ` +
          `все вхождения в области: ${inRegion.every(Boolean)}`,
      );
    }
  }

  lines.push(
    `страниц: ${names.length}; без начала «${region.start}»: ${noStart}; ` +
      `без конца «${region.end}»: ${noEnd}; неверный порядок: ${badOrder}`,
  );
  const sum = (i: number) => Object.values(hits).reduce((a, c) => a + c[i], 0);
  lines.push(
    `страниц с вхождениями: ${Object.keys(hits).length}; ` +
      `всего: ${labels.map((label, i) => `${label} ${sum(i)}`).join(", ")}`,
  );

  return {
    lines,
    noStart,
    noEnd,
    badOrder,
    pagesWithHits: Object.keys(hits).length,
    totals: labels.map((_, i) => sum(i)),
    // Недопустимая область — отказ. До этого инструмент выходил с 0, даже
    // когда маркера не было ни на одной странице: ровно та форма, из-за
    // которой в #81 понадобилось исправление snapshot-align.
    exitCode: noStart + noEnd > 0 ? 1 : 0,
  };
}

// ───────────────────────── режим --expect ─────────────────────────

export type ExpectResult = {
  lines: string[];
  /** Файлы ожиданий: имя и содержимое. Формат читает snapshot-align. */
  files: { file: string; json: string }[];
  exitCode: number;
};

export function expectDirs(names: string[], read: ReadPage, commits: CommitSpec[]): ExpectResult {
  const lines: string[] = [];
  const files: { file: string; json: string }[] = [];
  let bad = 0;

  for (const c of commits) {
    const needles = Object.keys(c.места).map((label) => c.места[label]);
    const fact = new Map<string, number>();
    for (const name of names)
      fact.set(name.replace(/\.html$/, ""), occurrences(read(name).split("\n"), needles).length);
    const pages = [...fact.keys()].sort();
    let sum = 0;
    const diff: string[] = [];
    for (const page of pages) {
      const f = fact.get(page)!;
      sum += f;
      if ((c.план[page] ?? 0) !== f) diff.push(`${page}: план ${c.план[page] ?? 0}, факт ${f}`);
    }
    for (const page of Object.keys(c.план))
      if (!fact.has(page)) diff.push(`${page}: страницы нет в снимке`);
    lines.push(
      `${c.метка}: страниц ${pages.length}, строк по факту ${sum}, расхождений ${diff.length}`,
    );
    for (const d of diff) lines.push(`  ${d}`);
    bad += diff.length;
    const json: Expectations = {};
    for (const page of pages) if (c.план[page]) json[page] = [c.план[page], 0];
    files.push({ file: c.файл, json: JSON.stringify(json, null, 1) });
  }

  return { lines, files, exitCode: bad ? 1 : 0 };
}

// ───────────────────────── запуск ─────────────────────────

function htmlNames(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".html"))
    .sort();
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  try {
    if (argv[0] === "--expect") {
      const [, dir, specPath, outDir] = argv;
      const commits = loadCommits(specPath);
      for (const line of commitsEcho(specPath, commits)) console.log(line);
      const result = expectDirs(
        htmlNames(dir),
        (name) => fs.readFileSync(path.join(dir, name), "utf8"),
        commits,
      );
      for (const f of result.files) fs.writeFileSync(path.join(outDir, f.file), f.json);
      for (const line of result.lines) console.log(line);
      process.exit(result.exitCode);
    }
    const [dir, specPath, rs, re] = argv;
    const places = loadPlaces(specPath);
    for (const line of specEcho(specPath, places)) console.log(line);
    const region: Region = { start: rs || DEFAULT_REGION.start, end: re || DEFAULT_REGION.end };
    const result = locateDirs(
      htmlNames(dir),
      (name) => fs.readFileSync(path.join(dir, name), "utf8"),
      places,
      region,
    );
    for (const line of result.lines) console.log(line);
    process.exit(result.exitCode);
  } catch (err) {
    if (!(err instanceof SpecError)) throw err;
    console.error(`Отказ: ${err.message}`);
    process.exit(2);
  }
}
