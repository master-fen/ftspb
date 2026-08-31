import { TIMEWEB_CA } from "./ca";

/**
 * Нужен ли TLS — свойство сервера, а не строки подключения. Локальный кластер
 * разработчика поднят без шифрования вовсе, боевой Timeweb требует
 * `verify-full`. Поэтому решение принимается по хосту: `sslmode` в строке
 * может быть забыт, скопирован вместе с боевой строкой или отброшен
 * потребителем (`drizzle.config.ts` разбирает URL на части и теряет
 * query-строку целиком) — хост переживает всех потребителей одинаково.
 *
 * Направление отказа безопасное: любой хост вне списка ниже (в том числе
 * `::1`) получает TLS с проверкой CA. Ошибка конфигурации приводит к
 * громкому падению, а не к тихому незашифрованному соединению.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export type PgSslOption = false | { ca: string; rejectUnauthorized: true };

function hostOf(connectionString: string): string {
  return new URL(connectionString).hostname;
}

export function isLocalHost(connectionString: string): boolean {
  return LOCAL_HOSTS.has(hostOf(connectionString));
}

/**
 * Результат обязан присваиваться ключу `ssl` **всегда** — никаких условных
 * спредов. postgres.js резолвит каждую опцию как
 * `k in options ? options[k] : k in queryString ? queryString[k] : default`
 * (node_modules/postgres/src/index.js, parseOptions). Пока ключ `ssl`
 * физически присутствует в объекте опций, он перекрывает `?sslmode=` в URL;
 * стоит его пропустить — управление вернётся строке подключения, и локальный
 * запуск с боевой строкой в буфере обмена молча уйдёт в TLS-рукопожатие.
 *
 * Это требование не стилистическое. Проверено подключением: боевой кластер
 * Timeweb **принимает незашифрованные соединения** — с `ssl: false` тот же
 * сервер (201.34.130.194, default_db) отдаёт `pg_stat_ssl.ssl = false` вместо
 * отказа. Значит шифрование трафика до прода держится исключительно на
 * клиенте: пропав отсюда, TLS не восстановится ни сервером, ни ошибкой —
 * соединение просто станет открытым, молча.
 */
export function sslFor(connectionString: string): PgSslOption {
  return isLocalHost(connectionString) ? false : { ca: TIMEWEB_CA, rejectUnauthorized: true };
}

/**
 * Метка цели подключения для первой строки вывода скриптов: `хост/база`,
 * без логина и пароля. Принимает `undefined`, потому что часть скриптов
 * (`migrate-archive.ts --dry-run`) обязана печатать свой заголовок и работать
 * вообще без живой БД.
 */
export function describeTarget(connectionString: string | undefined): string {
  if (!connectionString) {
    return "DATABASE_URL не задан";
  }
  const url = new URL(connectionString);
  return `${url.hostname}/${url.pathname.replace(/^\//, "")}`;
}
