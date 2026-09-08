import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { getSessionFn } from "@/lib/auth-server-fn";

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
  component: AdminLayout,
});

function AdminLayout() {
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
      <Outlet />
    </>
  );
}
