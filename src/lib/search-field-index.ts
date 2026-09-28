/**
 * Предвычисленные множества слов поля для индекса публичного поиска: только
 * словарь (какие свёрнутые формы/основы встречаются), не позиции — позиции
 * хранятся лишь у коротких полей (заголовок, анонс), где нужна подсветка на
 * каждой находке. У длинных полей (тело новости, повестка события) позиции
 * пересчитываются по требованию только для показанной страницы находок
 * (`docs/decisions.md`) — иначе память индекса растёт от длины текста, а не
 * от размера словаря, и на ~1990 новостях рискует не уложиться в 150 МБ.
 */
import { tokenize } from "@/lib/search-tokenize";
import { foldForSearch } from "@/lib/search-text";
import { stemWord } from "@/lib/search-stem";

export type TokenOccurrence = { folded: string; stem: string; start: number; end: number };
export type FieldPresence = { exactSet: ReadonlySet<string>; stemSet: ReadonlySet<string> };
export type FieldWithPositions = FieldPresence & { text: string; occurrences: TokenOccurrence[] };

/** Дефис — уже часть свёртки токена, не отдельный символ основы. */
function foldToken(surface: string): string {
  return foldForSearch(surface).replace(/-/g, "");
}

/**
 * Пул интернирования строк на всю сборку индекса: частые основы
 * («федерация», «теннис») делят одну строку на все записи вместо тысяч
 * копий — заметно снижает память при ~1990 новостях с пересекающейся
 * лексикой. Для отдельного вызова вне сборки (тесты) не нужен —
 * по умолчанию тождественная функция.
 */
export function createInternPool(): (value: string) => string {
  const pool = new Map<string, string>();
  return (value: string): string => {
    const existing = pool.get(value);
    if (existing !== undefined) return existing;
    pool.set(value, value);
    return value;
  };
}

export function tokenizeWithStems(
  text: string,
  intern: (value: string) => string = (value) => value,
): TokenOccurrence[] {
  return tokenize(text).map((token) => {
    const folded = intern(foldToken(token.surface));
    const stem = intern(stemWord(folded));
    return { folded, stem, start: token.start, end: token.end };
  });
}

export function buildFieldPresence(occurrences: TokenOccurrence[]): FieldPresence {
  const exactSet = new Set<string>();
  const stemSet = new Set<string>();
  for (const occurrence of occurrences) {
    exactSet.add(occurrence.folded);
    stemSet.add(occurrence.stem);
  }
  return { exactSet, stemSet };
}

export function buildFieldWithPositions(
  text: string,
  intern?: (value: string) => string,
): FieldWithPositions {
  const occurrences = tokenizeWithStems(text, intern);
  return { ...buildFieldPresence(occurrences), text, occurrences };
}
