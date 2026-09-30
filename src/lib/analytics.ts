import { PRODUCTION_HOSTS } from "@/lib/site";

/** Номер счётчика Яндекс Метрики. Не секрет: виден в коде любой страницы. */
export const METRIKA_COUNTER_ID = 113184646;

/** Счётчик грузится только на боевых адресах (точное совпадение, не суффикс). */
export function isProductionHost(hostname: string): boolean {
  return PRODUCTION_HOSTS.includes(hostname);
}

/** Админка (`/admin` и всё под ним) не считается. `/administration` — не админка. */
export function isExcludedPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function shouldTrack(hostname: string, pathname: string): boolean {
  return isProductionHost(hostname) && !isExcludedPath(pathname);
}

/**
 * Ключ просмотра: pathname + search, без hash. Смена одного hash (фото в
 * галерее, оглавление Устава, `/privacy#cookies`) — не новое открытие страницы.
 */
export function pageKey(pathname: string, search: string): string {
  return `${pathname}${search}`;
}
