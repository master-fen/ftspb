/**
 * Детерминированный разбор построчной выгрузки текстового слоя Устава
 * (docs/charter/ustav.lines.json) в CharterContent. Правила зафиксированы в ТЗ
 * и закреплены контрольными числами в tests/charter-content.test.ts: любое
 * изменение правил обязано менять и тесты, «подгонка» в одну сторону запрещена.
 *
 * Координаты — пункты PDF, начало координат сверху слева: x0/x1 — левый и
 * правый край строки, top/bottom — вертикальные границы.
 */
import type { CharterBlock, CharterContent, CharterSection } from "./types";

export interface CharterSourceLine {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

export interface CharterSourcePage {
  page: number;
  lines: CharterSourceLine[];
}

export interface CharterLinesJson {
  source: {
    file: string;
    sha256: string;
    pages: number;
    pageSize: [number, number];
    extractor: string;
    units: string;
  };
  pages: CharterSourcePage[];
}

/** Маркеры списков, оставшиеся в текстовом слое символами Wingdings. */
const BULLET_MARKERS = ["\uF0A7", "\uF0B7"] as const;

/** Заголовок раздела: «N. ЗАГОЛОВОК ПРОПИСНЫМИ», выключенный к центру (x0 > 120). */
const SECTION_TITLE_RE = /^(\d{1,2})\. ([А-ЯЁ][А-ЯЁ ,]+)$/;

/** Начало нумерованного пункта; пробел после точки может отсутствовать («10.1.Внесение»). */
const CLAUSE_RE = /^(\d{1,2})\.(\d{1,2})\./;

/** Символы, которыми заканчивается завершённая строка абзаца. */
const SENTENCE_END = [".", ";", ":", "!", "?", "»", ")"] as const;

/**
 * Принудительные начала абзацев. Ровно одна строка: п. 9.1 набран без
 * выключки, геометрия там не отличает абзац; строка возвращается на базовый
 * отступ 85.1 после продолжений элемента списка на 127.1.
 */
const FORCED_BREAKS = new Set([
  "В данном видении графики указывается на развитии данного вида спорта федерацией в",
]);

/** Зазор между строками титульного листа, разделяющий группы преамбулы. */
const PREAMBLE_GAP = 10;

/** Правый край строки, означающий выключку до правого поля (абзац не закончился). */
const JUSTIFIED_X1 = 536;

/** Минимальный висячий отступ продолжения элемента списка относительно itemX0. */
const ITEM_HANG_INDENT = 10;

/** Строка-номер страницы: справа внизу, 1–2 цифры. */
function isPageNumberLine(line: CharterSourceLine): boolean {
  return line.x0 > 540 && /^\d{1,2}$/.test(line.text.trim());
}

/** Повторные пробелы внутри строки сводятся к одному; других замен нет. */
function collapseSpaces(text: string): string {
  return text.replace(/ {2,}/g, " ");
}

/** Склейка продолжения: после дефиса — без пробела (переносы составных слов), иначе через пробел. */
function appendLine(base: string, next: string): string {
  return collapseSpaces(base.endsWith("-") ? base + next : `${base} ${next}`);
}

/** Продолжается ли абзац предыдущей строки на текущей. */
function continues(prev: CharterSourceLine, line: CharterSourceLine): boolean {
  if (prev.x1 >= JUSTIFIED_X1) {
    return true;
  }
  const prevText = prev.text.trim();
  const lastChar = prevText.slice(-1);
  if ((SENTENCE_END as readonly string[]).includes(lastChar)) {
    return false;
  }
  const firstChar = line.text.trim().charAt(0);
  return (
    firstChar !== "" &&
    firstChar === firstChar.toLowerCase() &&
    firstChar !== firstChar.toUpperCase()
  );
}

type OpenBlock =
  | { kind: "paragraph"; text: string; clause?: string }
  | { kind: "item"; text: string; itemX0: number };

export function parseCharterLines(json: CharterLinesJson): CharterContent {
  const [titlePage, ...bodyPages] = json.pages;
  if (!titlePage) {
    throw new Error("Пустая выгрузка: нет ни одной страницы");
  }

  // Преамбула: строки страницы 1 без склейки; новая группа при вертикальном зазоре.
  const preamble: string[][] = [];
  let prevTitleLine: CharterSourceLine | null = null;
  for (const line of titlePage.lines) {
    const text = collapseSpaces(line.text.trim());
    if (prevTitleLine === null || line.top - prevTitleLine.bottom > PREAMBLE_GAP) {
      preamble.push([text]);
    } else {
      preamble[preamble.length - 1].push(text);
    }
    prevTitleLine = line;
  }

  // Тело: страницы 2–17 подряд, без строк-номеров; граница страницы ничего не значит.
  const bodyLines = bodyPages
    .flatMap((page) => page.lines)
    .filter((line) => !isPageNumberLine(line));

  const sections: CharterSection[] = [];
  let section: CharterSection | null = null;
  let open: OpenBlock | null = null;
  // x0 первого элемента хвостового блока-списка текущего раздела, пока список продолжается.
  let openListX0: number | null = null;
  let prev: CharterSourceLine | null = null;

  const closeOpen = (): void => {
    if (open === null) {
      return;
    }
    if (section === null) {
      throw new Error(`Текст до первого заголовка раздела: «${open.text}»`);
    }
    if (open.kind === "paragraph") {
      const block: CharterBlock =
        open.clause === undefined
          ? { kind: "paragraph", text: open.text }
          : { kind: "paragraph", text: open.text, clause: open.clause };
      section.blocks.push(block);
      openListX0 = null;
    } else {
      const lastBlock = section.blocks[section.blocks.length - 1];
      if (
        lastBlock !== undefined &&
        lastBlock.kind === "list" &&
        openListX0 !== null &&
        Math.abs(open.itemX0 - openListX0) <= 1
      ) {
        lastBlock.items.push(open.text);
      } else {
        section.blocks.push({ kind: "list", items: [open.text] });
        openListX0 = open.itemX0;
      }
    }
    open = null;
  };

  for (const line of bodyLines) {
    const text = collapseSpaces(line.text.trim());

    // 1. Заголовок раздела.
    const titleMatch = SECTION_TITLE_RE.exec(text);
    if (titleMatch !== null && line.x0 > 120) {
      closeOpen();
      section = { number: Number(titleMatch[1]), title: titleMatch[2], blocks: [] };
      sections.push(section);
      openListX0 = null;
      prev = line;
      continue;
    }

    // 2. Элемент списка.
    const marker = BULLET_MARKERS.find((m) => text.startsWith(m));
    if (marker !== undefined) {
      closeOpen();
      open = { kind: "item", text: text.slice(marker.length).replace(/^ +/, ""), itemX0: line.x0 };
      prev = line;
      continue;
    }

    // 3. Начало нумерованного пункта или принудительный разрыв.
    const clauseMatch = CLAUSE_RE.exec(text);
    if (clauseMatch !== null || FORCED_BREAKS.has(text)) {
      closeOpen();
      open =
        clauseMatch === null
          ? { kind: "paragraph", text }
          : { kind: "paragraph", text, clause: `${clauseMatch[1]}.${clauseMatch[2]}` };
      prev = line;
      continue;
    }

    // 4. Продолжение открытого блока.
    if (
      open !== null &&
      prev !== null &&
      (continues(prev, line) || (open.kind === "item" && line.x0 >= open.itemX0 + ITEM_HANG_INDENT))
    ) {
      open.text = appendLine(open.text, text);
      prev = line;
      continue;
    }

    // 5. Иначе — новый абзац.
    closeOpen();
    open = { kind: "paragraph", text };
    prev = line;
  }
  closeOpen();

  return { preamble, sections };
}
