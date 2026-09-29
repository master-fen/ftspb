/**
 * Индекс публичного поиска в памяти процесса, по образцу `news-cache.ts`, но
 * с истечением TTL, не блокирующим посетителя (`news-cache.ts` не совмещает
 * параллельные сборки вовсе — здесь наоборот, три ветки поведения):
 *
 * 1. Индекс просрочен (TTL истёк) — отдаётся прежний немедленно, пересборка
 *    запускается в фоне; вторая параллельная просрочка не плодит вторую
 *    фоновую сборку — только одна на всех.
 * 2. Явный сброс (`resetSearchIndex()` из мутации админки) — состояние
 *    обнуляется целиком: следующий запрос ждёт новую сборку синхронно.
 * 3. Ошибка фоновой сборки — индекс выбрасывается (не остаётся служить
 *    устаревшим бесконечно); следующий запрос собирает синхронно и падает,
 *    если БД недоступна (не глотается, `CLAUDE.md`, «Данные»).
 *
 * Поколение (`generation`) защищает от гонки «сброс во время сборки»:
 * результат сборки, начатой до сброса, не должен перезаписать состояние
 * после него, если он pазрешится позже.
 */
import { db } from "@/db/client";
import { createInternPool } from "@/lib/search-field-index";
import { buildDocumentsIndex, type DocumentIndexItem } from "@/server/search-index-documents";
import { buildEventsIndex, type EventIndexItem } from "@/server/search-index-events";
import { buildNewsIndex, type NewsIndexItem } from "@/server/search-index-news";
import { buildSectionsIndex, type SectionIndexItem } from "@/server/search-index-sections";

export type SearchIndex = {
  news: NewsIndexItem[];
  documents: DocumentIndexItem[];
  events: EventIndexItem[];
  sections: SectionIndexItem[];
};

export const SEARCH_INDEX_TTL_MS = 60_000;

type CacheState<T> =
  | { kind: "empty" }
  | { kind: "ready"; index: T; expiresAt: number }
  | { kind: "building"; promise: Promise<T> };

export type IndexCache<T> = {
  load(): Promise<T>;
  reset(): void;
};

/** Общий движок трёх веток выше — параметризован сборкой, чтобы проверяться тестами без БД. */
export function createIndexCache<T>(build: () => Promise<T>, ttlMs: number): IndexCache<T> {
  let state: CacheState<T> = { kind: "empty" };
  let backgroundBuild: Promise<void> | null = null;
  let generation = 0;

  function startBackgroundBuild(): void {
    if (backgroundBuild) return;
    const myGeneration = generation;
    backgroundBuild = build()
      .then((index) => {
        if (myGeneration !== generation) return;
        state = { kind: "ready", index, expiresAt: Date.now() + ttlMs };
      })
      .catch(() => {
        if (myGeneration !== generation) return;
        state = { kind: "empty" };
      })
      .finally(() => {
        backgroundBuild = null;
      });
  }

  return {
    reset(): void {
      generation += 1;
      state = { kind: "empty" };
      backgroundBuild = null;
    },
    async load(): Promise<T> {
      if (state.kind === "ready") {
        if (state.expiresAt > Date.now()) return state.index;
        const staleIndex = state.index;
        startBackgroundBuild();
        return staleIndex;
      }
      if (state.kind === "building") return state.promise;

      const myGeneration = generation;
      const promise = build().then((index) => {
        if (myGeneration === generation) {
          state = { kind: "ready", index, expiresAt: Date.now() + ttlMs };
        }
        return index;
      });
      state = { kind: "building", promise };
      promise.catch(() => {
        if (myGeneration === generation) state = { kind: "empty" };
      });
      return promise;
    },
  };
}

async function buildSearchIndexFromDb(): Promise<SearchIndex> {
  if (db === null) {
    // Без БД страница открывается и не падает; искать по мок-данным не
    // обязательно (CLAUDE.md, «Данные»).
    return { news: [], documents: [], events: [], sections: [] };
  }
  const database = db;
  const intern = createInternPool();
  const [newsItems, documentItems, eventItems, sectionItems] = await Promise.all([
    buildNewsIndex(database, intern),
    buildDocumentsIndex(database, intern),
    buildEventsIndex(database, intern),
    buildSectionsIndex(intern),
  ]);
  return { news: newsItems, documents: documentItems, events: eventItems, sections: sectionItems };
}

const searchIndexCache = createIndexCache(buildSearchIndexFromDb, SEARCH_INDEX_TTL_MS);

export function loadSearchIndex(): Promise<SearchIndex> {
  return searchIndexCache.load();
}

/** Зовётся из каждой мутации news/document/event/federation_person/news_document/event_document. */
export function resetSearchIndex(): void {
  searchIndexCache.reset();
}
