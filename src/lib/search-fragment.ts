/**
 * Фрагмент текста с подсветкой для публичного поиска — массив структурных
 * отрезков `{ text, highlighted }`, не строка с разметкой: рендер —
 * `spans.map(s => s.highlighted ? <mark>{s.text}</mark> : s.text)`. Весь
 * пользовательский ввод проходит текстовым узлом React, `<script>` в
 * запросе печатается буквально без `dangerouslySetInnerHTML` и без функции
 * экранирования — безопасность по построению, не по внимательности.
 */
import type { TokenOccurrence } from "@/lib/search-field-index";
import { matchFormsPair, TIER_RANK, type MatchTier } from "@/lib/search-match";
import type { QueryTerm } from "@/lib/search-query";

export type FragmentSpan = { text: string; highlighted: boolean };

const DEFAULT_TARGET_LEN = 200;

function strongerTier(a: MatchTier | null, b: MatchTier | null): MatchTier | null {
  if (!a) return b;
  if (!b) return a;
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/** Лучший уровень совпадения вхождения против любого термина или его части. */
function bestTierAgainstTerms(occ: TokenOccurrence, terms: readonly QueryTerm[]): MatchTier | null {
  let best: MatchTier | null = null;
  for (const term of terms) {
    best = strongerTier(best, matchFormsPair(term.whole, occ));
    for (const part of term.parts) {
      best = strongerTier(best, matchFormsPair(part, occ));
    }
  }
  return best;
}

function snapStartForward(text: string, pos: number): number {
  if (pos <= 0) return 0;
  if (text[pos - 1] === " " || text[pos] === " ") return pos;
  const nextSpace = text.indexOf(" ", pos);
  return nextSpace === -1 ? text.length : nextSpace + 1;
}

function snapEndBackward(text: string, pos: number): number {
  if (pos >= text.length) return text.length;
  if (text[pos] === " " || text[pos - 1] === " ") return pos;
  const prevSpace = text.lastIndexOf(" ", pos);
  return prevSpace === -1 ? 0 : prevSpace;
}

function computeHighlightIntervals(
  occurrences: readonly TokenOccurrence[],
  terms: readonly QueryTerm[],
  start: number,
  end: number,
): Array<[number, number]> {
  const raw: Array<[number, number]> = [];
  for (const occ of occurrences) {
    if (occ.start < start || occ.end > end) continue;
    if (bestTierAgainstTerms(occ, terms)) raw.push([occ.start, occ.end]);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const interval of raw) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) {
      last[1] = Math.max(last[1], interval[1]);
    } else {
      merged.push([interval[0], interval[1]]);
    }
  }
  return merged;
}

function buildSpans(
  text: string,
  start: number,
  end: number,
  intervals: readonly [number, number][],
): FragmentSpan[] {
  const spans: FragmentSpan[] = [];
  let cursor = start;
  for (const [intervalStart, intervalEnd] of intervals) {
    if (intervalStart > cursor)
      spans.push({ text: text.slice(cursor, intervalStart), highlighted: false });
    spans.push({ text: text.slice(intervalStart, intervalEnd), highlighted: true });
    cursor = intervalEnd;
  }
  if (cursor < end) spans.push({ text: text.slice(cursor, end), highlighted: false });
  return spans;
}

export type FragmentField = { text: string; occurrences: readonly TokenOccurrence[] };

/**
 * ~200 знаков по границе слов вокруг лучшего совпадения (или от начала
 * текста, если в этом поле совпадений нет — «совпадение только в
 * заголовке» проверяется вызовом на другом поле). Подсвечивается любая
 * форма любого термина (или всех его частей), не только буквальная строка
 * запроса.
 */
export function extractFragment(
  field: FragmentField,
  terms: readonly QueryTerm[],
  targetLen: number = DEFAULT_TARGET_LEN,
): FragmentSpan[] {
  const { text, occurrences } = field;
  if (text.length === 0) return [];

  let anchor: TokenOccurrence | null = null;
  let anchorTier: MatchTier | null = null;
  for (const occ of occurrences) {
    const tier = bestTierAgainstTerms(occ, terms);
    if (!tier) continue;
    const isBetter =
      !anchor ||
      TIER_RANK[tier] > TIER_RANK[anchorTier as MatchTier] ||
      (TIER_RANK[tier] === TIER_RANK[anchorTier as MatchTier] && occ.start < anchor.start);
    if (isBetter) {
      anchor = occ;
      anchorTier = tier;
    }
  }

  let start: number;
  let end: number;
  if (text.length <= targetLen) {
    start = 0;
    end = text.length;
  } else if (anchor) {
    const mid = (anchor.start + anchor.end) / 2;
    start = Math.max(0, Math.round(mid - targetLen / 2));
    end = Math.min(text.length, start + targetLen);
    start = Math.max(0, end - targetLen);
  } else {
    start = 0;
    end = targetLen;
  }

  const snappedStart = snapStartForward(text, start);
  const snappedEnd = snapEndBackward(text, end);
  const [finalStart, finalEnd] =
    snappedStart < snappedEnd ? [snappedStart, snappedEnd] : [start, end];

  const intervals = computeHighlightIntervals(occurrences, terms, finalStart, finalEnd);
  const body = buildSpans(text, finalStart, finalEnd, intervals);

  const spans: FragmentSpan[] = [];
  if (finalStart > 0) spans.push({ text: "…", highlighted: false });
  spans.push(...body);
  if (finalEnd < text.length) spans.push({ text: "…", highlighted: false });
  return spans;
}

/** Для терминала (`search:probe`): подсвеченные слова заключаются в `**…**`. */
export function fragmentToPlainMarked(spans: readonly FragmentSpan[]): string {
  return spans.map((span) => (span.highlighted ? `**${span.text}**` : span.text)).join("");
}
