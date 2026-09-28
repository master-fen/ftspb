/**
 * Разбор строки запроса в термины публичного поиска. Составной прогон
 * (дефис или стык цифра↔буква — `src/lib/search-tokenize.ts`) — ОДИН
 * значимый термин, а не несколько: у него есть слитная форма (`whole`) и
 * список частей (`parts`); запись считается содержащей термин, если в ней
 * есть слитная форма ИЛИ все части (см. `matchesTerm` в `search-match.ts`).
 * Без этого «Санкт-Петербург» не находил бы текст «Санкт Петербург» без
 * дефиса, а «вице-президент» требовал бы редкой слитной формы в тексте.
 *
 * Только этот модуль решает, что термин «значим»: длина свёрнутой слитной
 * формы ≥2 и она не служебное слово. У частей термина такого фильтра нет —
 * они участвуют в сопоставлении как есть, даже однобуквенные («г» из
 * «2019г»).
 */
import { foldForSearch } from "@/lib/search-text";
import { stemWord } from "@/lib/search-stem";
import { isStopword } from "@/lib/search-stopwords";
import { tokenizeRuns } from "@/lib/search-tokenize";

export const MAX_QUERY_LENGTH = 100;

export type TermForms = { folded: string; stem: string };
export type QueryTerm = { whole: TermForms; parts: TermForms[] };

export type ParsedSearchQuery = {
  /** Запрос после среза до MAX_QUERY_LENGTH — для эха пользователю. */
  raw: string;
  terms: QueryTerm[];
  tooVague: boolean;
};

/** Дефис вырезается уже после свёртки — сам символ не несёт смысла в основе. */
function foldToken(surface: string): string {
  return foldForSearch(surface).replace(/-/g, "");
}

function toForms(surface: string): TermForms {
  const folded = foldToken(surface);
  return { folded, stem: stemWord(folded) };
}

export function parseSearchQuery(raw: string | undefined): ParsedSearchQuery {
  const clamped = (raw ?? "").slice(0, MAX_QUERY_LENGTH);
  const terms: QueryTerm[] = [];
  for (const run of tokenizeRuns(clamped)) {
    const wholeForms = toForms(run.whole.surface);
    if (wholeForms.folded.length < 2 || isStopword(wholeForms.folded)) continue;
    const parts = run.parts.map((part) => toForms(part.surface));
    terms.push({ whole: wholeForms, parts });
  }
  return { raw: clamped, terms, tooVague: terms.length === 0 };
}
