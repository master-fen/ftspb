/**
 * Сопоставление и оценка «Сначала подходящие» публичного поиска. Формула,
 * пороги и алгебраическое доказательство обоих требуемых заданием свойств
 * (при равном тексте новее — выше; старая новость со словом в заголовке
 * выше свежей с тем же словом один раз в тексте) — `docs/decisions.md`.
 */
import type { FieldPresence } from "@/lib/search-field-index";
import type { QueryTerm, TermForms } from "@/lib/search-query";

export type MatchTier = "exact" | "stem" | "prefix";

/**
 * Уровень «начало основы»: только кириллица, только когда основы обеих
 * сторон ≥5 знаков, и более короткая — начало более длинной (в любую
 * сторону), не «первые 5 знаков совпали» — тот вариант ловил бы случайные
 * совпадения («федеральный»↔«федерацию» по «федер…»).
 */
const MIN_PREFIX_STEM_LENGTH = 5;
const HAS_CYRILLIC_RE = /[а-я]/;

function isPrefixEitherDirection(a: string, b: string): boolean {
  if (a.length < MIN_PREFIX_STEM_LENGTH || b.length < MIN_PREFIX_STEM_LENGTH) return false;
  return a.length <= b.length ? b.startsWith(a) : a.startsWith(b);
}

/** Порядок силы уровня — используется и здесь, и подсветкой фрагмента. */
export const TIER_RANK: Record<MatchTier, number> = { exact: 3, stem: 2, prefix: 1 };

function weaker(a: MatchTier, b: MatchTier): MatchTier {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

function matchFormsInField(forms: TermForms, field: FieldPresence): MatchTier | null {
  if (field.exactSet.has(forms.folded)) return "exact";
  if (field.stemSet.has(forms.stem)) return "stem";
  if (HAS_CYRILLIC_RE.test(forms.stem)) {
    for (const candidate of field.stemSet) {
      if (isPrefixEitherDirection(forms.stem, candidate)) return "prefix";
    }
  }
  return null;
}

/**
 * Тот же трёхуровневый разбор, но между двумя отдельными формами (не
 * термин-против-множества-поля) — нужен подсветке (`search-fragment.ts`):
 * какое именно вхождение в окне сниппета совпало с термином запроса.
 */
export function matchFormsPair(a: TermForms, b: TermForms): MatchTier | null {
  if (a.folded === b.folded) return "exact";
  if (a.stem === b.stem) return "stem";
  if (
    HAS_CYRILLIC_RE.test(a.stem) &&
    HAS_CYRILLIC_RE.test(b.stem) &&
    isPrefixEitherDirection(a.stem, b.stem)
  ) {
    return "prefix";
  }
  return null;
}

/**
 * Составной термин (whole+parts, `src/lib/search-query.ts`) считается
 * найденным в поле, если найдена слитная форма, ИЛИ найдены ВСЕ части —
 * тогда итоговый уровень термина в поле равен наислабейшему из уровней
 * его частей (общая уверенность ограничена самой слабой частью).
 */
export function matchTermInField(term: QueryTerm, field: FieldPresence): MatchTier | null {
  const wholeTier = matchFormsInField(term.whole, field);
  if (wholeTier) return wholeTier;
  if (term.parts.length <= 1) return null;
  let combined: MatchTier = "exact";
  for (const part of term.parts) {
    const tier = matchFormsInField(part, field);
    if (!tier) return null;
    combined = weaker(combined, tier);
  }
  return combined;
}

/** exact и stem — один вес (см. docs/decisions.md — иначе порядок зависит от формы запроса). */
export const FORM_WEIGHT: Record<MatchTier, number> = { exact: 1, stem: 1, prefix: 0.3 };

export const FIELD_WEIGHT = {
  news: { title: 100, excerpt: 40, body: 10 },
  document: { title: 100 },
  event: { title: 100, description: 40, location: 10 },
  section: { title: 100, text: 40 },
} as const;

export type FieldWeightMap<F extends string> = Record<F, number>;

export type TextMatchResult = { matchedCount: number; textScore: number };

/**
 * Вклад термина в запись = максимум вклада по полям (заголовок доминирует
 * над тем же словом в тексте); `textScore` = сумма по терминам, найденным
 * хотя бы в одном поле. `matchedCount` — число терминов запроса, найденных
 * хотя бы в одном поле (для решения «все слова / часть слов»,
 * `selectByMatchMode` ниже).
 */
export function scoreRecordText<F extends string>(
  terms: readonly QueryTerm[],
  fields: Record<F, FieldPresence>,
  fieldWeight: FieldWeightMap<F>,
): TextMatchResult {
  let matchedCount = 0;
  let textScore = 0;
  const fieldNames = Object.keys(fieldWeight) as F[];
  for (const term of terms) {
    let best = 0;
    for (const fieldName of fieldNames) {
      const tier = matchTermInField(term, fields[fieldName]);
      if (!tier) continue;
      const contribution = fieldWeight[fieldName] * FORM_WEIGHT[tier];
      if (contribution > best) best = contribution;
    }
    if (best > 0) {
      matchedCount += 1;
      textScore += best;
    }
  }
  return { matchedCount, textScore };
}

/** 2000-01-01 UTC — фиксированная точка отсчёта, не «сегодня» (иначе порядок менялся бы ежедневно). */
const RECENCY_EPOCH_MS = Date.UTC(2000, 0, 1);
const RECENCY_DIVISOR = 1_000_000;
const MS_PER_DAY = 86_400_000;

/**
 * Строго < 1 в любую разумную дату, строго растёт с датой — на этом
 * держится доказательство «при равном тексте новее выше»
 * (docs/decisions.md).
 */
export function recencyBonus(publishedAtIso: string): number {
  const days = (Date.parse(publishedAtIso) - RECENCY_EPOCH_MS) / MS_PER_DAY;
  return days / RECENCY_DIVISOR;
}

/**
 * "none" — отдельно от "partial": если вообще ни один кандидат ни одного
 * типа не содержит ни одного значимого слова, это «ничего не нашлось», а не
 * «неполное совпадение» — баннер «Точных совпадений нет…» в этом случае
 * показывать нечего (находок с частью слов тоже нет).
 */
export type MatchMode = "full" | "partial" | "none";

/**
 * Решение «все слова / часть слов» — одно на весь запрос, по кандидатам
 * ВСЕХ типов разом (не по типам отдельно): иначе на одной странице
 * смешались бы полные новости и частичные документы, а числа по вкладкам
 * считались бы по разным правилам.
 */
export function decideMatchMode(
  allCandidateMatchedCounts: readonly number[],
  totalSignificantTerms: number,
): MatchMode {
  if (allCandidateMatchedCounts.some((count) => count === totalSignificantTerms)) return "full";
  if (allCandidateMatchedCounts.some((count) => count > 0)) return "partial";
  return "none";
}

export function selectByMatchMode<T extends { matchedCount: number }>(
  candidates: readonly T[],
  mode: MatchMode,
  totalSignificantTerms: number,
): T[] {
  if (mode === "full") {
    return candidates.filter((c) => c.matchedCount === totalSignificantTerms);
  }
  // "partial" и "none" отбирают одинаково (matchedCount > 0) — при "none"
  // результат заведомо пуст у всех типов, отдельная ветка не нужна.
  return candidates.filter((c) => c.matchedCount > 0);
}

/**
 * `matchedCount desc` → `score desc` → вторичный ключ, переданный вызывающей
 * стороной (свой для новостей/документов/событий/разделов, см.
 * docs/decisions.md). Внутри уже отобранного режима (`selectByMatchMode`)
 * `matchedCount` у всех кандидатов одинаков в режиме "full" и просто
 * "больше — раньше" в режиме "partial" — один компаратор покрывает оба.
 */
export function compareRelevance<T extends { matchedCount: number; score: number }>(
  secondary: (a: T, b: T) => number,
): (a: T, b: T) => number {
  return (a, b) => {
    if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
    if (b.score !== a.score) return b.score - a.score;
    return secondary(a, b);
  };
}

/** «published_at desc, created_at desc, id desc» — как у ленты; общий приём для дат-триплетов любого типа. */
export function compareDateTriplet(
  a: { dateKey: string; createdAt: string; id: string },
  b: { dateKey: string; createdAt: string; id: string },
): number {
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}
