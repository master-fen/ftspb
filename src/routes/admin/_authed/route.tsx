import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { getSessionFn } from "@/lib/auth-server-fn";
import { requestMigrationStatus } from "@/lib/migration-status-request";
import { getMigrationStatus } from "@/lib/migration-status-server-fn";
import { MigrationBanner } from "./-components/MigrationBanner";

/**
 * Пропускает дальше, только если сессия жива — throw redirect на /admin/login
 * иначе. Это навигационный guard для UX, а не граница безопасности: каждая
 * серверная функция админки обязана проверять сессию сама (см. CLAUDE.md).
 */
export const Route = createFileRoute("/admin/_authed")({
  beforeLoad: async ({ location }) => {
    const session = await getSessionFn();
    if (!session) {
      throw redirect({ to: "/admin/login", search: { redirect: location.href } });
    }
    return { session };
  },
  // Состояние журнала миграций — для баннера на всех страницах админки.
  // requestMigrationStatus не выбрасывает: исключение в лоадере рамы заменило
  // бы errorComponent-ом всю админку. Кешем (60 с) управляет сама серверная
  // функция.
  // shouldReload: true — без него лоадер рамы при переходе между дочерними
  // страницами не перезапускается (матч рамы тот же, cause 'stay'), и баннер в
  // открытой вкладке устаревает навсегда. staleTime не задан намеренно: при
  // shouldReload: true вычисление по staleTime не выполняется ни на переходе,
  // ни на том же адресе, ни на предзагрузке (router-core,
  // `shouldReload ?? staleMatchShouldReload`). Перезапуск идёт фоном, переход
  // не ждёт; цена — вызов серверной функции на каждый переход и на каждое
  // наведение на ссылку админки (defaultPreload: "intent").
  loader: () => requestMigrationStatus(() => getMigrationStatus()),
  shouldReload: true,
  component: AdminLayout,
});

function AdminLayout() {
  const migrationStatus = Route.useLoaderData();

  return (
    <>
      <nav aria-label="Управление сайтом" className="border-b bg-card px-4 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 py-3 text-sm">
          <Link
            to="/admin"
            activeOptions={{ exact: true }}
            className="mr-3 rounded-lg px-3 py-2 font-semibold"
            activeProps={{ className: "bg-muted" }}
          >
            Управление сайтом
          </Link>
          {(
            [
              { to: "/admin/news", label: "Новости" },
              { to: "/admin/documents", label: "Документы" },
              { to: "/admin/persons", label: "Руководство" },
            ] as const
          ).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted"
              activeProps={{ className: "bg-muted font-medium text-foreground" }}
            >
              {item.label}
            </Link>
          ))}
          <Link
            to="/"
            target="_blank"
            className="ml-auto rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted"
          >
            Открыть сайт ↗
          </Link>
        </div>
      </nav>
      {/* Над содержимым любой страницы админки. При `ok` баннера нет — и полосы
          с отступами под него тоже. */}
      {migrationStatus.state === "ok" ? null : (
        <div className="bg-background px-4 pt-6 md:px-8">
          <div className="mx-auto max-w-6xl">
            <MigrationBanner status={migrationStatus} />
          </div>
        </div>
      )}
      <Outlet />
    </>
  );
}
