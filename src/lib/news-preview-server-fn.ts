import { createServerFn } from "@tanstack/react-start";
import { getNewsPreview as getNewsPreviewImpl } from "@/server/news";

/**
 * Данные предпросмотра новости редактором. `src/server/**` из route-файла
 * напрямую не импортируется (import-protection TanStack Start) — обёртка
 * `createServerFn`, как в src/lib/news-server-fn.ts.
 *
 * Сессию проверяет сама `getNewsPreview` (src/server/news.ts): эндпоинт
 * вызывается по HTTP напрямую, guard админки навигационный (CLAUDE.md).
 */
export const getNewsPreview = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(({ data }) => getNewsPreviewImpl(data));
