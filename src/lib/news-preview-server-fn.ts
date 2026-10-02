import { createServerFn } from "@tanstack/react-start";
import { getNewsPreview as getNewsPreviewImpl } from "@/server/news";

/**
 * Данные предпросмотра новости редактором и страницы согласования по ключу.
 * `src/server/**` из route-файла напрямую не импортируется (import-protection
 * TanStack Start) — обёртка `createServerFn`, как в src/lib/news-server-fn.ts.
 *
 * Доступ проверяет сама `getNewsPreview` (src/server/news.ts): эндпоинт
 * вызывается по HTTP напрямую, guard админки навигационный (CLAUDE.md).
 *
 * POST, а не GET: у GET аргумент уходит в адрес вызова (`?payload=…`), и ключ
 * ссылки согласования попадал бы в адреса запросов при переходах на клиенте.
 * Валидатор без zod — проверка формы, ключ любой строкой: верность решает сервер.
 */
export const getNewsPreview = createServerFn({ method: "POST" })
  .validator((input: { id: string; key?: string }) => {
    if (typeof input?.id !== "string") throw new Error("id: ожидается строка");
    if (input.key !== undefined && typeof input.key !== "string") {
      throw new Error("key: ожидается строка");
    }
    return { id: input.id, key: input.key };
  })
  .handler(({ data }) => getNewsPreviewImpl(data));
