import { createServerFn } from "@tanstack/react-start";
import {
  getFeaturedAndLatest as getFeaturedAndLatestImpl,
  getNewsBySlug as getNewsBySlugImpl,
  listNews as listNewsImpl,
} from "@/server/news";

/**
 * `src/server/**` запрещён к прямому импорту из клиентского бандла
 * (import-protection плагин TanStack Start — route-модули собираются и в
 * клиент, и в сервер). `createServerFn` — санкционированный обход: тело
 * `.handler()` компилируется только в серверный чанк, на клиенте остаётся
 * RPC-заглушка.
 */
export const listNews = createServerFn({ method: "GET" }).handler(() => listNewsImpl());

export const getNewsBySlug = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(({ data }) => getNewsBySlugImpl(data));

export const getFeaturedAndLatest = createServerFn({ method: "GET" }).handler(() =>
  getFeaturedAndLatestImpl(),
);
