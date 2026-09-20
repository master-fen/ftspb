/**
 * Отдельный проход сжатия архивных фото перед заливкой.
 *
 * Запуск:
 *   bun run scripts/compress-archive.ts --source=D:\Webarchive\export \
 *     --assets=D:\Webarchive --out=D:\Webarchive\compressed
 *
 * Читает выгрузку, проходит все фото и документы и пишет результат в
 * отдельную папку с той же структурой каталогов. Правило — то же, что в
 * админке (src/lib/image-resize.ts), вынесено в scripts/archive-image-rule.ts.
 * Перекодированный файл меняет расширение, поэтому рядом кладётся
 * исправленная копия выгрузки, где пути указывают на новые имена. Исходные
 * файлы и исходная выгрузка не меняются.
 *
 * Зачем отдельным проходом, а не внутри мигратора: заливка идёт часами и
 * может прерваться, а пересжимать при каждом перезапуске незачем; и сжатые
 * файлы можно посмотреть глазами до того, как они уедут в бакет.
 *
 * Фазы строго последовательны: сначала проверяется ВСЁ (существование
 * файлов, метаданные, коллизии выходных имён), и только потом пишется хоть
 * один байт. Ни одного обращения к S3 и к базе здесь нет.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import {
  JPEG_QUALITY,
  MAX_DIMENSION,
  type FileAction,
  collisions,
  decideAction,
  isImagePath,
  outputRelPath,
} from "./archive-image-rule";

type ArchiveRecord = {
  Заголовок?: string;
  Обложка?: string;
  Галерея?: string[];
  Документы?: string[];
  [key: string]: unknown;
};

// ───────────────────────── аргументы ─────────────────────────

function parseArgs(argv: string[]) {
  let source: string | undefined;
  let assets: string | undefined;
  let out: string | undefined;
  let limit: number | undefined;
  let concurrency = 8;

  for (const arg of argv) {
    if (arg.startsWith("--source=")) {
      source = arg.slice("--source=".length);
    } else if (arg.startsWith("--assets=")) {
      assets = arg.slice("--assets=".length);
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
    } else if (arg.startsWith("--limit=")) {
      limit = Number(arg.slice("--limit=".length));
    } else if (arg.startsWith("--concurrency=")) {
      concurrency = Number(arg.slice("--concurrency=".length));
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  if (!source) throw new Error("--source обязателен");
  if (!out) throw new Error("--out обязателен");
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit должен быть положительным целым числом");
  }
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("--concurrency должен быть положительным целым числом");
  }
  return { source, assets: assets ?? source, out, limit, concurrency };
}

const { source, assets, out, limit, concurrency } = parseArgs(process.argv.slice(2));

const EXPORT_NAME = "news_export_local.json";

// ───────────────────────── вспомогательное ─────────────────────────

/** Пул одновременных задач: порядок результатов не важен, вход не мутируется. */
async function inParallel<T>(
  items: ReadonlyArray<T>,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

function human(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} ГБ` : `${mb.toFixed(2)} МБ`;
}

/** Перекодирование — ровно тот конвейер, что одобрен разовой операцией 18.09.2026. */
function encode(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .toColourspace("srgb")
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside" })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

// ───────────────────────── фаза 1: состав ─────────────────────────

const exportPath = path.join(source, EXPORT_NAME);
const records: ArchiveRecord[] = JSON.parse(fs.readFileSync(exportPath, "utf-8"));
const working = limit !== undefined ? records.slice(0, limit) : records;

const relPaths: string[] = [];
const seen = new Set<string>();
for (const rec of working) {
  const all = [
    ...(rec["Обложка"] ? [rec["Обложка"]] : []),
    ...(rec["Галерея"] ?? []),
    ...(rec["Документы"] ?? []),
  ];
  for (const rel of all) {
    if (/^https?:\/\//i.test(rel)) continue;
    if (seen.has(rel)) continue;
    seen.add(rel);
    relPaths.push(rel);
  }
}

console.log(
  `Выгрузка: ${EXPORT_NAME}, записей ${records.length}, обрабатывается ${working.length}`,
);
console.log(`Уникальных путей к файлам: ${relPaths.length}`);

// ───────────────────── фаза 2: решения, ничего не пишем ─────────────────────

type Entry = {
  rel: string;
  src: string;
  action: FileAction;
  outRel: string;
  sizeIn: number;
  widthIn: number;
  heightIn: number;
};

const entries: Entry[] = new Array(relPaths.length);
const unreadable: string[] = [];

await inParallel(relPaths, async (rel, i) => {
  const src = path.join(assets, rel);
  let sizeIn = 0;
  try {
    sizeIn = fs.statSync(src).size;
  } catch {
    unreadable.push(`${rel} — файла нет на диске`);
    return;
  }
  let meta: { format?: string; width?: number; height?: number } | null = null;
  if (isImagePath(rel)) {
    try {
      const m = await sharp(src).metadata();
      meta = { format: m.format, width: m.width, height: m.height };
    } catch (error) {
      unreadable.push(`${rel} — не читается как изображение: ${(error as Error).message}`);
      return;
    }
  }
  let action: FileAction;
  try {
    action = decideAction(rel, meta);
  } catch (error) {
    unreadable.push(`${rel} — ${(error as Error).message}`);
    return;
  }
  entries[i] = {
    rel,
    src,
    action,
    outRel: outputRelPath(rel, action),
    sizeIn,
    widthIn: meta?.width ?? 0,
    heightIn: meta?.height ?? 0,
  };
});

unreadable.sort();
if (unreadable.length > 0) {
  console.error(`Не удалось прочитать файлов: ${unreadable.length}`);
  for (const u of unreadable) console.error(`  ${u}`);
  console.error("Ничего не записано: проход останавливается до записи.");
  process.exit(1);
}

const byAction = new Map<FileAction, Entry[]>();
for (const e of entries) {
  const arr = byAction.get(e.action) ?? [];
  arr.push(e);
  byAction.set(e.action, arr);
}
const count = (a: FileAction) => byAction.get(a)?.length ?? 0;

console.log("─── решения правила ───");
console.log(`  перекодировать (длинная сторона > ${MAX_DIMENSION}): ${count("transform")}`);
console.log(`  копия, изображение в пределах ${MAX_DIMENSION}: ${count("copy-small")}`);
console.log(`  копия, GIF (правило админки его не трогает): ${count("copy-gif")}`);
console.log(`  копия, документ: ${count("copy-document")}`);

// Коллизии выходных имён: смена расширения может положить `a.png` поверх
// существующего `a.jpg`. Останавливаемся до записи.
const mapping = new Map(entries.map((e) => [e.rel, e.outRel]));
const clashes = collisions(mapping);
if (clashes.length > 0) {
  console.error(`Коллизии выходных имён: ${clashes.length}`);
  for (const c of clashes) console.error(`  ${c.out} ← ${c.sources.join(" + ")}`);
  console.error("Ничего не записано: проход останавливается до записи.");
  process.exit(1);
}
console.log("  коллизий выходных имён: 0");

// ───────────────────────── фаза 3: запись файлов ─────────────────────────

fs.mkdirSync(out, { recursive: true });
const madeDirs = new Set<string>();
let written = 0;

await inParallel(entries, async (e) => {
  const dest = path.join(out, e.outRel);
  const dir = path.dirname(dest);
  if (!madeDirs.has(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    madeDirs.add(dir);
  }
  if (e.action === "transform") {
    fs.writeFileSync(dest, await encode(fs.readFileSync(e.src)));
  } else {
    fs.copyFileSync(e.src, dest);
  }
  written += 1;
  if (written % 1000 === 0) {
    console.log(`  записано ${written} из ${entries.length}`);
  }
});
console.log(`Записано файлов: ${written}`);

// ───────────────────── фаза 4: исправленная выгрузка ─────────────────────

// При --limit исправленная выгрузка содержит только обработанные записи:
// иначе в ней остались бы пути к файлам, которых в папке нет, и папка
// перестала бы быть самодостаточной. При полном прогоне working === records.
const fixed: ArchiveRecord[] = working.map((rec) => {
  const next: ArchiveRecord = { ...rec };
  const remap = (rel: string) => mapping.get(rel) ?? rel;
  if (next["Обложка"]) next["Обложка"] = remap(next["Обложка"]);
  if (next["Галерея"]) next["Галерея"] = next["Галерея"].map(remap);
  if (next["Документы"]) next["Документы"] = next["Документы"].map(remap);
  return next;
});
fs.writeFileSync(path.join(out, EXPORT_NAME), JSON.stringify(fixed, null, 2) + "\n", "utf-8");
console.log(`Исправленная выгрузка: ${EXPORT_NAME}, записей ${fixed.length}`);

// ───────────────────────── фаза 5: проверки ─────────────────────────

let sizeIn = 0;
let sizeOut = 0;
for (const e of entries) sizeIn += e.sizeIn;

// Длинные стороны собираются по индексу, максимум считается после цикла:
// при параллельной проверке порядок прихода результатов не задан, и «первый
// с максимумом» отличался бы между двумя прогонами (замерено: 1600 у
// maydansky02.jpg против maydansky03.jpg). Ничья разрешается по пути.
const longSides: Array<number | null> = new Array(entries.length).fill(null);
let checkedImages = 0;
const bad: string[] = [];

await inParallel(entries, async (e, i) => {
  const dest = path.join(out, e.outRel);
  let st: fs.Stats;
  try {
    st = fs.statSync(dest);
  } catch {
    bad.push(`${e.outRel} — выходного файла нет`);
    return;
  }
  sizeOut += st.size;
  if (!isImagePath(e.outRel)) return;
  const m = await sharp(dest).metadata();
  const longSide = Math.max(m.width ?? 0, m.height ?? 0);
  checkedImages += 1;
  longSides[i] = longSide;
  if (m.format !== "gif" && longSide > MAX_DIMENSION) {
    bad.push(`${e.outRel} — длинная сторона ${longSide} больше ${MAX_DIMENSION}`);
  }
});

let maxLongSide = 0;
let maxLongSideRel = "";
for (let i = 0; i < entries.length; i++) {
  const v = longSides[i];
  if (v === null) continue;
  if (v > maxLongSide || (v === maxLongSide && entries[i].outRel < maxLongSideRel)) {
    maxLongSide = v;
    maxLongSideRel = entries[i].outRel;
  }
}

// Каждый путь исправленной выгрузки существует на диске.
const fixedPaths = new Set<string>();
for (const rec of fixed) {
  for (const rel of [
    ...(rec["Обложка"] ? [rec["Обложка"]] : []),
    ...(rec["Галерея"] ?? []),
    ...(rec["Документы"] ?? []),
  ]) {
    if (/^https?:\/\//i.test(rel)) continue;
    fixedPaths.add(rel);
  }
}
const missingOnDisk: string[] = [];
for (const rel of fixedPaths) {
  if (!fs.existsSync(path.join(out, rel))) missingOnDisk.push(rel);
}

/** Сколько файлов физически лежит в выходной папке (выгрузка и отчёт не в счёт). */
function countFiles(dir: string): number {
  let n = 0;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) n += countFiles(path.join(dir, item.name));
    else if (item.name !== EXPORT_NAME && item.name !== "compress-report.md") n += 1;
  }
  return n;
}
const onDisk = countFiles(out);

const gifMax = Math.max(
  0,
  ...(byAction.get("copy-gif") ?? []).map((e) => Math.max(e.widthIn, e.heightIn)),
);

console.log("─── проверки ───");
console.log(`  путей в исправленной выгрузке: ${fixedPaths.size}, файлов в папке: ${onDisk}`);
console.log(`  путей исправленной выгрузки, которых нет на диске: ${missingOnDisk.length}`);
console.log(`  изображений проверено: ${checkedImages}`);
console.log(`  максимальная длинная сторона после прохода: ${maxLongSide} (${maxLongSideRel})`);
console.log(`  из них GIF (правилом не ограничены), максимум: ${gifMax}`);
bad.sort();
console.log(`  нарушений предела среди не-GIF: ${bad.length}`);
for (const b of bad) console.log(`    ${b}`);
console.log("─── объём ───");
console.log(`  до:    ${sizeIn} Б (${human(sizeIn)})`);
console.log(`  после: ${sizeOut} Б (${human(sizeOut)})`);
console.log(`  доля:  ${((sizeOut / sizeIn) * 100).toFixed(1)}%`);

const lines: string[] = [];
lines.push("# compress-archive — отчёт прохода сжатия", "");
lines.push(`- записей в выгрузке: ${records.length}, обработано: ${working.length}`);
lines.push(`- уникальных путей к файлам: ${relPaths.length}`);
lines.push(`- перекодировано (длинная сторона > ${MAX_DIMENSION}): ${count("transform")}`);
lines.push(`- скопировано без изменений, изображение в пределах предела: ${count("copy-small")}`);
lines.push(`- скопировано без изменений, GIF: ${count("copy-gif")}`);
lines.push(`- скопировано без изменений, документ: ${count("copy-document")}`);
lines.push(`- не удалось прочитать: ${unreadable.length}`);
lines.push(`- коллизий выходных имён: ${clashes.length}`);
lines.push("");
lines.push(`- объём до: ${sizeIn} Б (${human(sizeIn)})`);
lines.push(`- объём после: ${sizeOut} Б (${human(sizeOut)})`);
lines.push(`- максимальная длинная сторона после прохода: ${maxLongSide} (${maxLongSideRel})`);
lines.push(`- максимальная длинная сторона среди GIF: ${gifMax}`);
lines.push(`- изображений проверено: ${checkedImages}, нарушений предела: ${bad.length}`);
lines.push(`- путей в исправленной выгрузке: ${fixedPaths.size}, файлов в папке: ${onDisk}`);
lines.push(`- путей выгрузки, которых нет на диске: ${missingOnDisk.length}`);
lines.push("");
fs.writeFileSync(path.join(out, "compress-report.md"), lines.join("\n"), "utf-8");

const failed =
  bad.length > 0 ||
  missingOnDisk.length > 0 ||
  onDisk !== fixedPaths.size ||
  written !== entries.length;
if (failed) {
  console.error("Проверки не сошлись — см. выше.");
  for (const m of missingOnDisk) console.error(`  нет на диске: ${m}`);
  process.exit(1);
}
console.log("Все проверки сошлись.");
