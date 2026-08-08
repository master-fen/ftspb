import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/** Timeweb-прокси всегда отдаёт http внутри контейнера — протоколу соединения доверять нельзя. */
export function wwwRedirectTarget(request: Request): string | null {
  try {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
    const host = forwardedHost || request.headers.get("host")?.trim() || "";
    if (!host.toLowerCase().startsWith("www.")) return null;
    const url = new URL(request.url);
    const target = `https://${host.slice(4)}${url.pathname}${url.search}`;
    new URL(target); // самопроверка: если host выродился (например "www." без хвоста), URL невалиден — не редиректим
    return target;
  } catch {
    return null;
  }
}

/**
 * Раздача статики из .output/public в Nitro-preset node-server обслуживается
 * внутренним обработчиком Nitro раньше requestMiddleware — прямой запрос к
 * уже существующему файлу в .output/public по адресу с www редиректа не
 * получит. На практике не проявляется: HTML-страница редиректится раньше,
 * чем браузер запросит статику.
 */
const wwwRedirectMiddleware = createMiddleware().server(async ({ request, next }) => {
  const target = wwwRedirectTarget(request);
  return target ? Response.redirect(target, 308) : next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, wwwRedirectMiddleware],
}));
