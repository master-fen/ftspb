import { withTimeout, type MigrationStatus } from "@/lib/migration-status";

/**
 * Клиентская граница вызова серверной функции статуса миграций — для лоадера
 * рамы админки (src/routes/admin/_authed/route.tsx). Исключение в лоадере рамы
 * заменило бы errorComponent-ом всю админку, а зависший промис — повесил бы
 * переход по ней. Поэтому наружу не выходит ничего, кроме значения: отказ
 * транспорта (сеть, 5xx, 401) и отсутствие ответа дают `request-failed`.
 * Redirect на вход при 401 намеренно не делается — навигационный guard уведёт
 * туда при следующем переходе, а редирект из лоадера рамы выбросил бы
 * администратора из заполненной формы при ложном 401.
 *
 * Загрузчик — параметром: модуль не импортирует ни серверную функцию, ни
 * src/server, поэтому тестируется без БД и сессии.
 */

/** Больше таймаута БД (5 с) в серверной функции: при живом транспорте срабатывает он. */
export const REQUEST_TIMEOUT_MS = 8_000;

export async function requestMigrationStatus(
  load: () => Promise<MigrationStatus>,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<MigrationStatus> {
  try {
    // async-обёртка: синхронный throw в load тоже становится отклонением.
    return await withTimeout((async () => load())(), timeoutMs, (error) => {
      console.error("Журнал миграций: запрос отклонён уже после таймаута", error);
    });
  } catch (error) {
    console.error("Журнал миграций: запрос проверки не выполнился", error);
    return { state: "unavailable", reason: "request-failed" };
  }
}
