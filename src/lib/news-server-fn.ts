import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SECTION_CATEGORIES } from "@/lib/section-category";
import {
  getFeaturedAndLatest as getFeaturedAndLatestImpl,
  getNewsArticle as getNewsArticleImpl,
  listNewsPage as listNewsPageImpl,
} from "@/server/news";

/**
 * `src/server/**` запрещён к прямому импорту из клиентского бандла
 * (import-protection плагин TanStack Start — route-модули собираются и в
 * клиент, и в сервер). `createServerFn` — санкционированный обход: тело
 * `.handler()` компилируется только в серверный чанк, на клиенте остаётся
 * RPC-заглушка.
 */
export const listNewsPage = createServerFn({ method: "GET" })
  // Номер вне диапазона приводит к первой странице сама функция (clampPage).
  .validator(z.object({ page: z.number().int(), category: z.enum(SECTION_CATEGORIES) }))
  .handler(({ data }) => listNewsPageImpl(data));

export const getNewsArticle = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(({ data }) => getNewsArticleImpl(data));

export const getFeaturedAndLatest = createServerFn({ method: "GET" }).handler(() =>
  getFeaturedAndLatestImpl(),
);
