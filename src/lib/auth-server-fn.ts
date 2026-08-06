import { createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  getRequestProtocol,
  setCookie,
} from "@tanstack/react-start/server";
import { z } from "zod";
import {
  createSession,
  deleteSession,
  getCurrentSession,
  SESSION_COOKIE,
  verifyLogin,
  type AdminSessionInfo,
} from "@/server/auth";
import { isLocked, recordFailure, recordSuccess } from "@/server/login-throttle";

/**
 * `src/server/**` запрещён к прямому импорту из клиентского бандла
 * (import-protection плагин TanStack Start). `createServerFn` — санкционированный
 * обход: тело `.handler()` компилируется только в серверный чанк.
 */

const SESSION_COOKIE_PATH = "/";

/**
 * NODE_ENV не задан в контейнере Timeweb (запуск — голый
 * `node .output/server/index.mjs`, без переменных окружения приложения),
 * поэтому secure-флаг cookie нельзя выводить из него — он всегда осел бы в
 * false на проде. Timeweb стоит за прокси, так что протокол сокета внутри
 * контейнера — всегда http; x-forwarded-proto разбирается вручную, потому
 * что getRequestProtocol в установленной версии h3 распознаёт этот заголовок
 * только при точном значении "https"/"http", а не список вида "https, http".
 */
function isSecureRequest(): boolean {
  const forwarded = getRequestHeader("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase();

  if (forwarded) {
    return forwarded === "https";
  }

  return getRequestProtocol({ xForwardedProto: false }) === "https";
}

function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  path: string;
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: SESSION_COOKIE_PATH,
    secure: isSecureRequest(),
  };
}

export type { AdminSessionInfo };

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; retryAfterMinutes: number };

function requestIp(): string {
  return getRequestIP({ xForwardedFor: true }) ?? "unknown";
}

export const loginFn = createServerFn({ method: "POST" })
  .validator(z.object({ login: z.string().min(1), password: z.string().min(1) }))
  .handler(async ({ data }): Promise<LoginResult> => {
    const ip = requestIp();

    const lock = isLocked(data.login, ip);
    if (lock.locked) {
      return {
        ok: false,
        reason: "locked",
        retryAfterMinutes: Math.ceil((lock.retryAfterMs ?? 0) / 60_000),
      };
    }

    // Не различаем «нет пользователя» и «неверный пароль» в ответе — verifyLogin
    // держит константное время сравнения именно для этого, разные сообщения
    // об ошибке свели бы его на нет.
    const user = await verifyLogin(data.login, data.password);
    if (!user) {
      recordFailure(data.login, ip);
      return { ok: false, reason: "invalid" };
    }
    recordSuccess(data.login, ip);

    const userAgent = getRequestHeader("user-agent") ?? null;
    const { token, expiresAt } = await createSession(user.id, { userAgent, ip });

    setCookie(SESSION_COOKIE, token, {
      ...sessionCookieOptions(),
      maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    });

    return { ok: true };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await deleteSession(token);
  }
  deleteCookie(SESSION_COOKIE, sessionCookieOptions());
});

export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminSessionInfo | null> => {
    const session = await getCurrentSession();
    if (!session) {
      // getCurrentSession() не сообщает, была ли cookie вообще — читаем её
      // здесь же, чтобы не гасить cookie, которой и не было: токен протух
      // или сессия удалена в БД — гасим мёртвую cookie, иначе клиент будет
      // слать её бесконечно.
      const token = getCookie(SESSION_COOKIE);
      if (token) {
        deleteCookie(SESSION_COOKIE, sessionCookieOptions());
      }
      return null;
    }

    return session;
  },
);
