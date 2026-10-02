import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { todayInMoscow } from "@/lib/today-msk";

/**
 * Ссылка на черновик для согласования: `/news/preview/ID?key=ТОКЕН`.
 * Токен и срок лежат в `news.preview_token` / `news.preview_token_expires_at`
 * (src/db/schema.ts), одна действующая ссылка на новость. Подписанных ссылок
 * без базы нет: их нельзя было бы отозвать (docs/decisions.md).
 *
 * Модуль только серверный: дата для полосы и редактора приходит строкой, и
 * клиентские чанки `today-msk.ts` не тянут.
 */

export const SHARE_LINK_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 32 случайных байта в base64url — 43 знака, безопасны в адресе без кодирования. */
export function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Момент окончания: создание + 14 суток. Годность решает `isShareLinkLive`. */
export function shareExpiresAt(now: Date): Date {
  return new Date(now.getTime() + SHARE_LINK_DAYS * DAY_MS);
}

/**
 * Ссылка годна по московскую дату срока включительно: на полосе написано
 * «действует до ДД.ММ.ГГГГ», и получатель не должен наткнуться на заглушку
 * днём этого числа. Строки `YYYY-MM-DD` сравниваются как строки.
 */
export function isShareLinkLive(expiresAt: Date, now: Date): boolean {
  return todayInMoscow(now) <= todayInMoscow(expiresAt);
}

/** Дата срока по Москве — `ДД.ММ.ГГГГ`. */
export function shareLinkDate(expiresAt: Date): string {
  const [year, month, day] = todayInMoscow(expiresAt).split("-");
  return `${day}.${month}.${year}`;
}

/**
 * Сравнение ключа за постоянное время. Сравниваются sha256 обеих строк:
 * `timingSafeEqual` требует равной длины, а длина ключа из адреса любая.
 */
export function sameShareKey(given: string, stored: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(stored).digest();
  return timingSafeEqual(a, b);
}

/** Строка новости, нужная решению о доступе по ключу. */
export type ShareLinkRow = {
  status: "draft" | "published";
  deletedAt: Date | null;
  previewToken: string | null;
  previewTokenExpiresAt: Date | null;
};

export type ShareAccess =
  | { kind: "invalid" }
  | { kind: "redirect" }
  | { kind: "shared"; expiresOn: string };

const INVALID: ShareAccess = { kind: "invalid" };

/**
 * Доступ по ключу без сессии. Любая неудача — одно и то же `invalid`: нет
 * новости, удалена, ссылка отозвана, срок истёк, ключ не тот (в том числе
 * ключ другой новости — строка читается по ID из адреса). По ответу нельзя
 * отличить причину и узнать, есть ли новость.
 *
 * Опубликованная с годным ключом — `redirect` на публичную страницу: токен
 * при публикации не стирается, держатель ссылки попадает на новость.
 */
export function decideShareAccess(row: ShareLinkRow | null, key: string, now: Date): ShareAccess {
  if (!row || row.deletedAt !== null) return INVALID;
  if (row.previewToken === null || row.previewTokenExpiresAt === null) return INVALID;
  if (!sameShareKey(key, row.previewToken)) return INVALID;
  if (!isShareLinkLive(row.previewTokenExpiresAt, now)) return INVALID;
  if (row.status === "published") return { kind: "redirect" };
  return { kind: "shared", expiresOn: shareLinkDate(row.previewTokenExpiresAt) };
}

/** Состояние ссылки для редактора: нет, истекла или действует (с токеном и датой). */
export type ShareLinkState =
  | { kind: "none" }
  | { kind: "expired" }
  | { kind: "active"; token: string; expiresOn: string };

export function shareLinkState(
  token: string | null,
  expiresAt: Date | null,
  now: Date,
): ShareLinkState {
  if (token === null || expiresAt === null) return { kind: "none" };
  if (!isShareLinkLive(expiresAt, now)) return { kind: "expired" };
  return { kind: "active", token, expiresOn: shareLinkDate(expiresAt) };
}
