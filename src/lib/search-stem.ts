/**
 * Единственная точка «нормализация + основа слова» публичного поиска.
 * Сборка индекса, разбор запроса и самотест обязаны идти через эту функцию,
 * а не звать `snowball-stemmers` напрямую: пакет сам по себе даёт 99.775%
 * совпадения с эталонным словарём (`tests/fixtures/snowball-ru-*.tsv`) —
 * 112 расхождений, все на словах с «ё» (диапазон гласных пакета не включает
 * `U+0451`). При своре ё→е перед вызовом — 100.0000% на всех 49785 парах
 * эталона (см. docs/decisions.md).
 *
 * Пакет — server/test-only: 868 КБ, 24 языка одним файлом. Модуль не
 * импортируется из файлов маршрутов (`src/routes/**`) — только из
 * `src/server/**` и `tests/**`, иначе стеммер уедет в клиентский чанк.
 */
import { newStemmer } from "snowball-stemmers";
import { foldForSearch } from "@/lib/search-text";

const HAS_CYRILLIC_RE = /[а-я]/;

let stemmer: ReturnType<typeof newStemmer> | null = null;

function getStemmer() {
  if (!stemmer) stemmer = newStemmer("russian");
  return stemmer;
}

/**
 * Свёрнутая форма (`foldForSearch`) плюс основа для кириллицы; цифры и
 * латиница возвращаются без изменений — у них нет основы в русской
 * морфологии, а прогон через русский стеммер на них не определён.
 */
export function stemWord(raw: string): string {
  const folded = foldForSearch(raw);
  if (!HAS_CYRILLIC_RE.test(folded)) return folded;
  return getStemmer().stem(folded);
}
