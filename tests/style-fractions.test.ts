/*
 * Защитный тест: инвентарь долей (классы вида УТИЛИТА-ИМЯ/NN) в публичной зоне
 * обязан совпадать с замороженным списком FROZEN.
 *
 * Список — не заметка, а счётчик долга. Закрывая долг типографики или открытый
 * вопрос «Поверхностей» (docs/style-rules.md), строку из списка вычёркивают тем
 * же PR. Цель — пустой список.
 *
 * Область и регулярка — те же, что в команде поиска правила (docs/style-rules.md,
 * «Поверхности»), слово в слово; файлы — через git ls-files с теми же pathspec,
 * что у git grep в правиле. Номеров строк в заморозке нет: они сдвигаются от
 * любой правки выше по файлу. Сравниваются тройки «путь, класс, количество» —
 * рост числа вхождений у замороженной пары тоже падение.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");

const AREA = [
  "src/components/site",
  "src/components/federation",
  "src/routes/_site*",
  "src/routes/__root.tsx",
  "src/styles.css",
];

const PATTERN =
  "(bg|text|border|ring|divide|outline|from|via|to|fill|stroke|shadow|decoration|placeholder|caret|accent)-[a-z][a-z0-9-]*/[0-9]+";

// [путь, класс, вхождений]; порядок — по пути, затем по классу.
const FROZEN: [string, string, number][] = [
  ["src/components/site/Breadcrumbs.tsx", "text-foreground/40", 1],
  ["src/components/site/CharterToc.tsx", "text-foreground/65", 1],
  ["src/components/site/DocumentFileRow.tsx", "text-foreground/50", 1],
  ["src/components/site/FederationSidebar.tsx", "text-foreground/60", 1],
  ["src/routes/_site.federation.events.tsx", "text-foreground/50", 1],
  ["src/routes/_site.federation.structure.tsx", "text-foreground/80", 1],
  ["src/routes/_site.federation_.charter.text.tsx", "text-foreground/80", 1],
  ["src/routes/_site.news.$newsId.tsx", "text-brand-navy/60", 1],
  ["src/routes/_site.news.$newsId.tsx", "text-brand-navy/70", 1],
  ["src/routes/_site.news.$newsId.tsx", "text-foreground/80", 1],
];

function fractions(text: string): string[] {
  return [...text.matchAll(new RegExp(PATTERN, "g"))].map((m) => m[0]);
}

function areaFiles(): string[] {
  const out = Bun.spawnSync(["git", "ls-files", "-z", "--", ...AREA], { cwd: root });
  if (out.exitCode !== 0) throw new Error(`git ls-files: ${out.stderr.toString()}`);
  return out.stdout.toString().split("\0").filter(Boolean);
}

function inventory(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of areaFiles())
    for (const cls of fractions(readFileSync(path.join(root, file), "utf8"))) {
      const key = `${file} → ${cls}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  return counts;
}

describe("доли в классах публичной зоны", () => {
  test("инвентарь равен замороженному списку", () => {
    const frozen = new Map(FROZEN.map(([file, cls, n]) => [`${file} → ${cls}`, n]));
    const actual = inventory();
    const added = [...actual].filter(([k]) => !frozen.has(k)).map(([k, n]) => `${k} (+${n})`);
    const removed = [...frozen].filter(([k]) => !actual.has(k)).map(([k, n]) => `${k} (−${n})`);
    const changed = [...actual]
      .filter(([k, n]) => frozen.has(k) && frozen.get(k) !== n)
      .map(([k, n]) => `${k} (${frozen.get(k)} → ${n})`);
    expect({
      добавилось: added.sort(),
      исчезло: removed.sort(),
      изменилось: changed.sort(),
    }).toEqual({ добавилось: [], исчезло: [], изменилось: [] });
  });

  test("самопроверка регулярки на образцах", () => {
    const positive: [string, string][] = [
      ["bg-brand-blue/10", "bg-brand-blue/10"],
      ["text-white/75", "text-white/75"],
      ["ring-black/5", "ring-black/5"],
      ["hover:bg-brand-orange/5", "bg-brand-orange/5"],
    ];
    for (const [sample, match] of positive) expect(fractions(sample)).toEqual([match]);
    const negative = [
      "bg-brand-blue",
      "text-lg",
      "w-1/2",
      "min-h-12",
      "rounded-md",
      "max-h-dvh",
      "aspect-[4/3]",
    ];
    for (const sample of negative) expect(fractions(sample)).toEqual([]);
  });
});
