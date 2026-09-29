import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MIN_ARCHIVE_YEAR } from "@/lib/admin-list-paging";
import { SEARCH_QUERY_MAX_LENGTH, SEARCH_SORTS, SEARCH_TABS } from "@/lib/search-params";
import { runSearch as runSearchImpl } from "@/server/search";

/**
 * RPC-обёртка вокруг `runSearch` (`src/server/search.ts`) — своя защита на
 * границе HTTP, независимая от разбора `?...=` в файле маршрута
 * (`src/lib/search-params.ts`): та отдаёт умолчание на любой мусор, эта
 * бросает на действительно некорректный вызов.
 */
export const runSearch = createServerFn({ method: "GET" })
  .validator(
    z.object({
      q: z.string().max(SEARCH_QUERY_MAX_LENGTH),
      tab: z.enum(SEARCH_TABS),
      year: z.union([z.literal("all"), z.number().int().min(MIN_ARCHIVE_YEAR)]),
      sort: z.enum(SEARCH_SORTS),
      page: z.number().int().min(1),
    }),
  )
  .handler(({ data }) => runSearchImpl(data));
