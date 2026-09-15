import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * Локатор мест по снимку и проверка маркеров области.
 *
 * Запуск:
 *   bun scripts/snapshot-locate.ts КАТАЛОГ СПЕЦ.json [НАЧАЛО КОНЕЦ]
 *
 * СПЕЦ.json: { "места": { "МЕТКА": ["искомая строка", …], … } }. Строки
 * конкретного PR в репозиторий не коммитятся — они приходят спецификацией, а
 * инструмент печатает прочитанное, чтобы в докладе было видно, что проверялось.
 *
 * На каждой странице снимка проверяются маркеры области и считаются вхождения
 * строк каждой метки: строка снимка засчитывается метке, если содержит любую из
 * её строк как подстроку.
 */

export type Places = Record<string, string[]>;
export type Region = { start: string; end: string };

export const DEFAULT_REGION: Region = { start: "<main", end: "</main>" };

export class SpecError extends Error {}

/** Разбор спецификации: объект с единственным ключом «места». */
export function parsePlaces(text: string, file = "спецификация"): Places {
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
  for (const key of keys)
    if (key !== "места") throw new SpecError(`${file}: неизвестный ключ верхнего уровня «${key}»`);
  const places = (parsed as Record<string, unknown>)["места"];
  if (typeof places !== "object" || places === null || Array.isArray(places))
    throw new SpecError(`${file}: «места» должно быть объектом «метка → строки»`);
  const entries = Object.entries(places);
  if (entries.length === 0) throw new SpecError(`${file}: «места» пусто`);
  const out: Places = {};
  for (const [label, value] of entries) {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.some((v) => typeof v !== "string" || v === "")
    )
      throw new SpecError(`${file}: значение метки «${label}» — не непустой массив непустых строк`);
    out[label] = value as string[];
  }
  return out;
}

export function loadPlaces(file: string): Places {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new SpecError(`${file}: файл спецификации не прочитан`);
  }
  return parsePlaces(text, file);
}

/** Эхо прочитанной спецификации: по строке на каждую искомую строку метки. */
export function specEcho(file: string, places: Places): string[] {
  const out = [`спецификация ${file}: меток ${Object.keys(places).length}`];
  for (const [label, values] of Object.entries(places))
    for (const value of values) out.push(`  ${label}: ${value}`);
  return out;
}

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
    }
    if (e < 0) {
      noEnd++;
      lines.push(`  нет конца: ${name}`);
    }
    if (s >= 0 && e >= 0 && !(e > s)) {
      badOrder++;
      lines.push(`  порядок: ${name}`);
    }
    const page = name.replace(/\.html$/, "");
    const counts = needles.map(
      (nd) => src.filter((l) => nd.some((needle) => l.includes(needle))).length,
    );
    const inRegion = needles.map((nd) =>
      src.every((l, i) => !nd.some((needle) => l.includes(needle)) || (i > s && i < e)),
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
    exitCode: 0,
  };
}

if (import.meta.main) {
  const [dir, specPath, rs, re] = process.argv.slice(2);
  let places: Places;
  try {
    places = loadPlaces(specPath);
  } catch (err) {
    console.error(`Отказ: ${(err as Error).message}`);
    process.exit(2);
  }
  for (const line of specEcho(specPath, places)) console.log(line);
  const region: Region = { start: rs || DEFAULT_REGION.start, end: re || DEFAULT_REGION.end };
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".html"))
    .sort();
  const result = locateDirs(
    names,
    (name) => fs.readFileSync(path.join(dir, name), "utf8"),
    places,
    region,
  );
  for (const line of result.lines) console.log(line);
  process.exit(result.exitCode);
}
