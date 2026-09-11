import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { MigrationStatus } from "@/lib/migration-status";

const REASON_TEXT = {
  "no-db": "база данных не настроена (DATABASE_URL не задан)",
  timeout: "база не ответила за 5 секунд",
  "query-failed": "запрос к журналу завершился ошибкой — нет таблицы журнала, прав или соединения",
  "request-failed": "запрос проверки не выполнился — сервер не ответил или ответил ошибкой",
} as const satisfies Record<Extract<MigrationStatus, { state: "unavailable" }>["reason"], string>;

/** Дата применения из `created_at` (мс). UTC — одинаково на сервере и в браузере. */
function formatCreatedAt(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * Баннер расхождения журнала миграций кода и базы (src/server/migration-status.ts).
 * При совпадении не рисуется вовсе — никакого «всё хорошо».
 * `data-migration-banner` — маркер для проверки SSR-снимка.
 */
export function MigrationBanner({ status }: { status: MigrationStatus }) {
  if (status.state === "ok") {
    return null;
  }

  if (status.state === "unavailable") {
    return (
      <Alert data-migration-banner="unavailable">
        <AlertTitle>Проверить журнал миграций не удалось</AlertTitle>
        <AlertDescription>
          Причина: {REASON_TEXT[status.reason]}. Совпадают ли код и база — неизвестно. Проверка
          повторится при следующем открытии этой страницы.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive" data-migration-banner="mismatch">
      <AlertTitle>Журнал миграций базы не совпадает с кодом</AlertTitle>
      <AlertDescription>
        {status.notApplied.length > 0 ? (
          <div>
            <p>Не применены к базе — страницы, которые их используют, будут падать:</p>
            <ul className="mt-1 list-disc pl-5 font-mono text-xs">
              {status.notApplied.map((entry) => (
                <li key={entry.when}>{entry.tag}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {status.unknownInDb.length > 0 ? (
          <div className="mt-3">
            <p>В базе есть миграции, которых нет в коде (код откатили на более старую версию?):</p>
            <ul className="mt-1 list-disc pl-5 font-mono text-xs">
              {status.unknownInDb.map((row) => (
                <li key={`${row.createdAt}-${row.hash12}`}>
                  {formatCreatedAt(row.createdAt)} · hash {row.hash12}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="mt-3">Баннер пропадёт в течение минуты после того, как журналы совпадут.</p>
      </AlertDescription>
    </Alert>
  );
}
