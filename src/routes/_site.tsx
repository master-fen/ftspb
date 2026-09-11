import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * Рама публичных страниц: шапка и подвал выше дочерних маршрутов, при переходе
 * между ними меняется только <Outlet/>. Полная высота — здесь: на короткой
 * странице `flex-1` прижимает подвал к низу экрана, на длинной подвал идёт
 * сразу после контента. Крошки, контейнеры и отступы остаются в страницах.
 *
 * Пока корневой PageTransition (src/routes/__root.tsx) ключует поддерево по
 * pathname, рама всё равно перемонтируется при смене адреса — перенос ключа
 * в эту раму будет, когда под ней окажутся все публичные маршруты.
 */
export const Route = createFileRoute("/_site")({
  component: SiteLayout,
});

function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter />
    </div>
  );
}
