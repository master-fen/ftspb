/**
 * Форма ответа публичного поиска — вынесена из `src/server/search.ts` в
 * клиент-безопасный `src/lib`: ни один компонент/файл маршрута не имеет
 * права импортировать что-либо из `src/server/**` (import-protection плагин
 * TanStack Start, `CLAUDE.md`), а строкам находок (`src/components/site`)
 * нужны эти типы для пропов. Значения (не типы) сюда не переезжают —
 * `runSearch` остаётся в `src/server/search.ts`.
 */
import type { SearchSort, SearchTab } from "@/lib/search-params";
import type { FragmentSpan } from "@/lib/search-fragment";
import type { NewsSection } from "@/lib/section-category";

export type SearchInput = {
  q: string;
  tab: SearchTab;
  year: number | "all";
  sort: SearchSort;
  page: number;
};

export type SearchNewsRow = {
  id: string;
  href: string;
  dateFormatted: string;
  section: NewsSection | null;
  title: FragmentSpan[];
  fragment: FragmentSpan[];
};

export type SearchDocumentParentRow = {
  kind: "news" | "event";
  title: string;
  dateFormatted: string;
  href: string;
};

export type SearchDocumentRow = {
  id: string;
  href: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dateFormatted: string;
  title: FragmentSpan[];
  parent: SearchDocumentParentRow | null;
};

export type SearchEventRow = {
  id: string;
  href: string;
  dateFormatted: string;
  location: string | null;
  title: FragmentSpan[];
  agendaFragment: FragmentSpan[];
};

export type SearchSectionRow = {
  id: string;
  href: string;
  breadcrumb: string[];
  title: FragmentSpan[];
  fragment: FragmentSpan[];
};

export type SearchResponse = {
  query: string;
  tooVague: boolean;
  /** Числа по вкладкам — по запросу, без учёта года и сортировки. */
  counts: { news: number; documents: number; events: number; sections: number };
  /** Годы, за которые есть новости по этому запросу (после отбора «все/часть слов»), по убыванию. */
  years: number[];
  tab: SearchTab;
  sort: SearchSort;
  year: number | "all";
  page: number;
  pageCount: number;
  /** «Найдено N» — с учётом года (для вкладок «Всё»/«Новости»). */
  totalForTab: number;
  partialMatch: boolean;
  news: SearchNewsRow[] | null;
  documentsTeaser: SearchDocumentRow[] | null;
  eventsTeaser: SearchEventRow[] | null;
  sectionsTeaser: SearchSectionRow[] | null;
  documents: SearchDocumentRow[] | null;
  events: SearchEventRow[] | null;
  sections: SearchSectionRow[] | null;
};
