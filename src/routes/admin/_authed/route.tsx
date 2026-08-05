import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
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
  component: () => <Outlet />,
});
