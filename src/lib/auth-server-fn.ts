import process from "node:process";
import { createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  setCookie,
} from "@tanstack/react-start/server";
import { z } from "zod";
import { createSession, deleteSession, validateSession, verifyLogin } from "@/server/auth";
import { isLocked, recordFailure, recordSuccess } from "@/server/login-throttle";

/**
 * `src/server/**` запрещён к прямому импорту из клиентского бандла
 * (import-protection плагин TanStack Start). `createServerFn` — санкционированный
 * обход: тело `.handler()` компилируется только в серверный чанк.
 */

const SESSION_COOKIE = "ftspb_admin_session";

export type AdminSessionInfo = {
  id: string;
  login: string;
  displayName: string;
};

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
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    });

    return { ok: true };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await deleteSession(token);
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
});

export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminSessionInfo | null> => {
    const token = getCookie(SESSION_COOKIE);
    if (!token) {
      return null;
    }

    const user = await validateSession(token);
    if (!user) {
      // Токен протух или сессия удалена в БД — гасим и мёртвую cookie,
      // иначе клиент будет слать её бесконечно.
      deleteCookie(SESSION_COOKIE, { path: "/" });
      return null;
    }

    return { id: user.id, login: user.login, displayName: user.displayName };
  },
);
