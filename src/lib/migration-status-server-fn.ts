import { createServerFn } from "@tanstack/react-start";
import { getMigrationStatus as getMigrationStatusImpl } from "@/server/migration-status";

/**
 * `src/server/**` запрещён к прямому импорту из клиентского бандла
 * (import-protection TanStack Start) — обёртка createServerFn. Сессию
 * проверяет сама getMigrationStatus (requireSession первой строкой).
 */
export const getMigrationStatus = createServerFn({ method: "GET" }).handler(() =>
  getMigrationStatusImpl(),
);
