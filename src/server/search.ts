/**
 * `runSearch()` — общая точка входа публичного поиска: страница `/search`
 * (через RPC-обёртку `src/lib/search-server-fn.ts`) и `scripts/search-probe.ts`
 * зовут ровно эту функцию, поэтому реализация одна и не расходится.
 *
 * Решение «все слова / часть слов» принимается один раз по кандидатам ВСЕХ
 * типов разом (`decideMatchMode`), до разбиения по вкладкам — иначе на
 * одной странице смешались бы полные новости и частичные документы, а
 * числа по вкладкам считались бы по разным правилам (docs/decisions.md).
 * Ответ не несёт полных текстов — только текущая страница находок,
 * посчитанные числа и список годов (`CLAUDE.md`, «Ответ сервера»).
 */
import { formatEventDateShort } from "@/lib/event-date";
import { formatIsoDateRu } from "@/lib/format-iso-date";
import { clampPage, pageCountFor } from "@/lib/news-paging";
import { tokenizeWithStems } from "@/lib/search-field-index";
import { extractFragment, type FragmentSpan } from "@/lib/search-fragment";
import {
  compareDateTriplet,
  compareRelevance,
  decideMatchMode,
  FIELD_WEIGHT,
  recencyBonus,
  scoreRecordText,
  selectByMatchMode,
  type MatchMode,
} from "@/lib/search-match";
import { parseSearchQuery, type QueryTerm } from "@/lib/search-query";
import type {
  SearchDocumentRow,
  SearchEventRow,
  SearchInput,
  SearchNewsRow,
  SearchResponse,
  SearchSectionRow,
} from "@/lib/search-response";
import { loadSearchIndex, type SearchIndex } from "@/server/search-index";
import type { DocumentIndexItem } from "@/server/search-index-documents";
import type { EventIndexItem } from "@/server/search-index-events";
import type { NewsIndexItem } from "@/server/search-index-news";
import type { SectionIndexItem } from "@/server/search-index-sections";

export type {
  SearchDocumentParentRow,
  SearchDocumentRow,
  SearchEventRow,
  SearchInput,
  SearchNewsRow,
  SearchResponse,
  SearchSectionRow,
} from "@/lib/search-response";

const SEARCH_PAGE_SIZE = 20;
const TEASER_LIMIT = 3;
/** Заголовок находки не обрезается — предел заведомо больше любого реального заголовка. */
const TITLE_FRAGMENT_LEN = 300;

function emptyResponse(query: string, input: SearchInput, tooVague: boolean): SearchResponse {
  return {
    query,
    tooVague,
    counts: { news: 0, documents: 0, events: 0, sections: 0 },
    years: [],
    tab: input.tab,
    sort: input.sort,
    year: input.year,
    page: 1,
    pageCount: 0,
    totalForTab: 0,
    partialMatch: false,
    news: null,
    documentsTeaser: null,
    eventsTeaser: null,
    sectionsTeaser: null,
    documents: null,
    events: null,
    sections: null,
  };
}

type Scored<T> = { item: T; matchedCount: number; textScore: number };

function scoreItems<T, F extends string>(
  items: readonly T[],
  terms: readonly QueryTerm[],
  toFields: (item: T) => Record<F, import("@/lib/search-field-index").FieldPresence>,
  fieldWeight: Record<F, number>,
): Scored<T>[] {
  return items.map((item) => {
    const { matchedCount, textScore } = scoreRecordText(terms, toFields(item), fieldWeight);
    return { item, matchedCount, textScore };
  });
}

function paginate<T>(
  sorted: readonly T[],
  page: number,
): { pageItems: T[]; page: number; pageCount: number; total: number } {
  const total = sorted.length;
  const pageCount = pageCountFor(total, SEARCH_PAGE_SIZE);
  const clamped = clampPage(page, pageCount);
  const start = (clamped - 1) * SEARCH_PAGE_SIZE;
  return {
    pageItems: sorted.slice(start, start + SEARCH_PAGE_SIZE),
    page: clamped,
    pageCount,
    total,
  };
}

function pickNewsFragment(item: NewsIndexItem, terms: readonly QueryTerm[]): FragmentSpan[] {
  const excerptFragment = extractFragment(item.excerpt, terms);
  if (excerptFragment.some((span) => span.highlighted)) return excerptFragment;
  const bodyField = { text: item.bodyText, occurrences: tokenizeWithStems(item.bodyText) };
  const bodyFragment = extractFragment(bodyField, terms);
  if (bodyFragment.some((span) => span.highlighted)) return bodyFragment;
  return excerptFragment.length > 0 ? excerptFragment : bodyFragment;
}

function buildNewsRow(item: NewsIndexItem, terms: readonly QueryTerm[]): SearchNewsRow {
  return {
    id: item.id,
    href: item.href,
    dateFormatted: formatIsoDateRu(item.publishedAt),
    section: item.section,
    title: extractFragment(item.title, terms, TITLE_FRAGMENT_LEN),
    fragment: pickNewsFragment(item, terms),
  };
}

function buildDocumentRow(item: DocumentIndexItem, terms: readonly QueryTerm[]): SearchDocumentRow {
  return {
    id: item.id,
    href: item.href,
    fileName: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    dateFormatted: formatIsoDateRu(item.documentDate),
    title: extractFragment(item.title, terms, TITLE_FRAGMENT_LEN),
    parent: item.parent
      ? {
          kind: item.parent.kind,
          title: item.parent.title,
          dateFormatted: formatIsoDateRu(item.parent.dateIso),
          href: item.parent.href,
        }
      : null,
  };
}

function buildEventRow(item: EventIndexItem, terms: readonly QueryTerm[]): SearchEventRow {
  return {
    id: item.id,
    href: item.href,
    dateFormatted: formatEventDateShort(item.startsOn, item.datePrecision),
    location: item.location.text || null,
    title: extractFragment(item.title, terms, TITLE_FRAGMENT_LEN),
    agendaFragment: extractFragment(item.description, terms),
  };
}

function buildSectionRow(item: SectionIndexItem, terms: readonly QueryTerm[]): SearchSectionRow {
  return {
    id: item.id,
    href: item.href,
    breadcrumb: item.breadcrumb,
    title: extractFragment(item.title, terms, TITLE_FRAGMENT_LEN),
    fragment: extractFragment(item.text, terms),
  };
}

/** `runSearch` минус загрузка индекса — вынесено ради теста без БД (index подменяется фикстурой). */
export function runSearchOverIndex(input: SearchInput, index: SearchIndex): SearchResponse {
  const parsed = parseSearchQuery(input.q);
  if (parsed.tooVague) {
    return emptyResponse(parsed.raw, input, true);
  }
  const terms = parsed.terms;

  const newsScored = scoreItems(
    index.news,
    terms,
    (item) => ({ title: item.title, excerpt: item.excerpt, body: item.bodyPresence }),
    FIELD_WEIGHT.news,
  );
  const documentsScored = scoreItems(
    index.documents,
    terms,
    (item) => ({ title: item.title }),
    FIELD_WEIGHT.document,
  );
  const eventsScored = scoreItems(
    index.events,
    terms,
    (item) => ({ title: item.title, description: item.description, location: item.location }),
    FIELD_WEIGHT.event,
  );
  const sectionsScored = scoreItems(
    index.sections,
    terms,
    (item) => ({ title: item.title, text: item.text }),
    FIELD_WEIGHT.section,
  );

  const allCounts = [
    ...newsScored.map((s) => s.matchedCount),
    ...documentsScored.map((s) => s.matchedCount),
    ...eventsScored.map((s) => s.matchedCount),
    ...sectionsScored.map((s) => s.matchedCount),
  ];
  const mode: MatchMode = decideMatchMode(allCounts, terms.length);
  const partialMatch = mode === "partial";

  const newsSelected = selectByMatchMode(newsScored, mode, terms.length);
  const documentsSelected = selectByMatchMode(documentsScored, mode, terms.length);
  const eventsSelected = selectByMatchMode(eventsScored, mode, terms.length);
  const sectionsSelected = selectByMatchMode(sectionsScored, mode, terms.length);

  const years = Array.from(
    new Set(newsSelected.map((s) => Number(s.item.publishedAt.slice(0, 4)))),
  ).sort((a, b) => b - a);

  const newsForYear =
    input.year === "all"
      ? newsSelected
      : newsSelected.filter((s) => s.item.publishedAt.slice(0, 4) === String(input.year));

  const newsWithScore = newsForYear.map((s) => ({
    ...s,
    score: s.textScore + recencyBonus(s.item.publishedAt),
  }));
  const newsDateKey = (s: (typeof newsWithScore)[number]) => ({
    dateKey: s.item.publishedAt,
    createdAt: s.item.createdAt,
    id: s.item.id,
  });
  const newsComparator =
    input.sort === "date"
      ? (a: (typeof newsWithScore)[number], b: (typeof newsWithScore)[number]) =>
          compareDateTriplet(newsDateKey(a), newsDateKey(b))
      : compareRelevance<(typeof newsWithScore)[number]>((a, b) =>
          compareDateTriplet(newsDateKey(a), newsDateKey(b)),
        );
  const newsSorted = [...newsWithScore].sort(newsComparator);

  const documentsWithScore = documentsSelected.map((s) => ({ ...s, score: s.textScore }));
  const documentsSorted = [...documentsWithScore].sort(
    compareRelevance((a, b) =>
      compareDateTriplet(
        { dateKey: a.item.documentDate, createdAt: a.item.createdAt, id: a.item.id },
        { dateKey: b.item.documentDate, createdAt: b.item.createdAt, id: b.item.id },
      ),
    ),
  );

  const eventsWithScore = eventsSelected.map((s) => ({ ...s, score: s.textScore }));
  const eventsSorted = [...eventsWithScore].sort(
    compareRelevance((a, b) =>
      compareDateTriplet(
        { dateKey: a.item.startsOn, createdAt: a.item.createdAt, id: a.item.id },
        { dateKey: b.item.startsOn, createdAt: b.item.createdAt, id: b.item.id },
      ),
    ),
  );

  const sectionsWithScore = sectionsSelected.map((s) => ({ ...s, score: s.textScore }));
  const sectionsSorted = [...sectionsWithScore].sort(
    compareRelevance((a, b) => a.item.order - b.item.order),
  );

  const counts = {
    news: newsSelected.length,
    documents: documentsSelected.length,
    events: eventsSelected.length,
    sections: sectionsSelected.length,
  };

  let page = 1;
  let pageCount = 0;
  let totalForTab = 0;
  let newsRows: SearchNewsRow[] | null = null;
  let documentsRows: SearchDocumentRow[] | null = null;
  let eventsRows: SearchEventRow[] | null = null;
  let sectionsRows: SearchSectionRow[] | null = null;
  let documentsTeaser: SearchDocumentRow[] | null = null;
  let eventsTeaser: SearchEventRow[] | null = null;
  let sectionsTeaser: SearchSectionRow[] | null = null;

  if (input.tab === "news" || input.tab === "all") {
    const paged = paginate(newsSorted, input.page);
    page = paged.page;
    pageCount = paged.pageCount;
    totalForTab = paged.total;
    newsRows = paged.pageItems.map((s) => buildNewsRow(s.item, terms));

    if (input.tab === "all" && page === 1) {
      sectionsTeaser = sectionsSorted
        .slice(0, TEASER_LIMIT)
        .map((s) => buildSectionRow(s.item, terms));
      documentsTeaser = documentsSorted
        .slice(0, TEASER_LIMIT)
        .map((s) => buildDocumentRow(s.item, terms));
      eventsTeaser = eventsSorted.slice(0, TEASER_LIMIT).map((s) => buildEventRow(s.item, terms));
    }
  } else if (input.tab === "documents") {
    const paged = paginate(documentsSorted, input.page);
    page = paged.page;
    pageCount = paged.pageCount;
    totalForTab = paged.total;
    documentsRows = paged.pageItems.map((s) => buildDocumentRow(s.item, terms));
  } else if (input.tab === "events") {
    const paged = paginate(eventsSorted, input.page);
    page = paged.page;
    pageCount = paged.pageCount;
    totalForTab = paged.total;
    eventsRows = paged.pageItems.map((s) => buildEventRow(s.item, terms));
  } else {
    const paged = paginate(sectionsSorted, input.page);
    page = paged.page;
    pageCount = paged.pageCount;
    totalForTab = paged.total;
    sectionsRows = paged.pageItems.map((s) => buildSectionRow(s.item, terms));
  }

  return {
    query: parsed.raw,
    tooVague: false,
    counts,
    years,
    tab: input.tab,
    sort: input.sort,
    year: input.year,
    page,
    pageCount,
    totalForTab,
    partialMatch,
    news: newsRows,
    documentsTeaser,
    eventsTeaser,
    sectionsTeaser,
    documents: documentsRows,
    events: eventsRows,
    sections: sectionsRows,
  };
}

export async function runSearch(input: SearchInput): Promise<SearchResponse> {
  const index = await loadSearchIndex();
  return runSearchOverIndex(input, index);
}
