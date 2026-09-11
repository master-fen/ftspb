import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { logoutFn } from "@/lib/auth-server-fn";
import { getMigrationStatus } from "@/lib/migration-status-server-fn";

export const Route = createFileRoute("/admin/_authed/")({
  // Состояние журнала миграций — для баннера. Кешем (60 с) управляет сама
  // getMigrationStatus; staleTime: 0 — чтобы defaultStaleTime роутера (60 с,
  // src/router.tsx) не сложился с ним и баннер не гас до двух минут.
  loader: () => getMigrationStatus(),
  staleTime: 0,
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
          <p className="mb-4 text-sm text-muted-foreground">
            Создание, редактирование и публикация новостей.
          </p>
          <Button asChild>
            <Link to="/admin/news">Перейти к новостям</Link>
          </Button>
        </section>

        <section className="rounded-xl border bg-card p-6 text-card-foreground">
          <h2 className="mb-2 text-lg font-semibold">Документы</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Загрузка и редактирование документов библиотеки.
          </p>
          <Button asChild>
            <Link to="/admin/documents">Перейти к документам</Link>
          </Button>
        </section>

        <section className="rounded-xl border bg-card p-6 text-card-foreground">
          <h2 className="mb-2 text-lg font-semibold">События</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Заседания Правления, Общие собрания, проверки контрольного органа.
          </p>
          <Button asChild>
            <Link to="/admin/events">Перейти к событиям</Link>
          </Button>
        </section>

        <section className="rounded-xl border bg-card p-6 text-card-foreground">
          <h2 className="mb-2 text-lg font-semibold">Руководство</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Состав руководства Федерации на странице «Руководство».
          </p>
          <Button asChild>
            <Link to="/admin/persons">Перейти к руководству</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
