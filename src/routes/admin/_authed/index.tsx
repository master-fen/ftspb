import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { logoutFn } from "@/lib/auth-server-fn";

export const Route = createFileRoute("/admin/_authed/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: () => logoutFn(),
    onSuccess: () => navigate({ to: "/admin/login" }),
  });

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Админка</h1>
            <p className="text-sm text-muted-foreground">Вы вошли как {session.displayName}</p>
          </div>
          <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
            {logout.isPending ? "Выходим…" : "Выйти"}
          </Button>
        </header>

        <section className="rounded-xl border bg-card p-6 text-card-foreground">
          <h2 className="mb-2 text-lg font-semibold">Новости</h2>
          <p className="text-sm text-muted-foreground">Раздел в разработке.</p>
        </section>
      </div>
    </div>
  );
}
