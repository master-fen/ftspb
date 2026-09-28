/**
 * Разбиение текста на слова для публичного поиска. Буквы и цифры — один
 * класс (`\p{L}\p{N}}`), поэтому «2019», «U16», «ITF» — обычные токены без
 * спецкейсов. Дефисный прогон («Санкт-Петербурга», «вице-президент») и стык
 * цифра↔буква без дефиса («2019г», «2019г.») трактуются одинаково: прогон
 * целиком даёт «слитную» форму (токен `whole`), а сами куски — «части»
 * (`parts`) — оба уровня попадают в индекс поля, чтобы текст «Санкт
 * Петербург» без дефиса находился по частям, а «2019г.» — по «2019».
 *
 * Для простого слова без дефиса и без смены цифра/буква «целиком» не
 * заводится — оно и есть единственная часть (`parts.length === 1`).
 */

const RUN_RE = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
const SUBRUN_RE = /\p{N}+|\p{L}+/gu;

export type Token = { surface: string; start: number; end: number };

/** Один «прогон» (без пробелов/пунктуации между частями) — слитная форма плюс куски. */
export type TokenRun = { whole: Token; parts: Token[] };

function scanRuns(text: string): TokenRun[] {
  const runs: TokenRun[] = [];
  for (const match of text.matchAll(RUN_RE)) {
    const run = match[0];
    const runStart = match.index;
    const parts: Token[] = [];
    let cursor = runStart;
    for (const segment of run.split("-")) {
      let segCursor = cursor;
      for (const sub of segment.match(SUBRUN_RE) ?? []) {
        parts.push({ surface: sub, start: segCursor, end: segCursor + sub.length });
        segCursor += sub.length;
      }
      cursor += segment.length + 1; // +1 — сам дефис; для последнего сегмента лишнее, но курсор больше не используется
    }
    const whole: Token =
      parts.length > 1 ? { surface: run, start: runStart, end: runStart + run.length } : parts[0];
    runs.push({ whole, parts });
  }
  return runs;
}

/** Группировка по прогонам — нужна разбору запроса (составной термин = whole + parts). */
export function tokenizeRuns(text: string): TokenRun[] {
  return scanRuns(text);
}

/** Плоский список токенов для индекса поля: у составного прогона — whole и все parts. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const run of scanRuns(text)) {
    if (run.parts.length > 1) tokens.push(run.whole);
    tokens.push(...run.parts);
  }
  return tokens;
}
