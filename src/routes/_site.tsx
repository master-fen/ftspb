import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * Фон рамы — флаг маршрута `staticData.siteBackground`. Под рамой область
 * между концом контента и подвалом на короткой странице рисует сама рама
 * (её `min-h-screen`), а не страница: фон страницы на эту область не
 * дотягивается. Флаг ставит только главная (`src/routes/_site.index.tsx`) —
 * её фон `bg-surface`. Без флага — `bg-background`, как у остальных страниц.
 * Два класса ниже выписаны литералами целиком намеренно: сканер Tailwind
 * читает исходник как текст и не видит классы, собранные шаблонной строкой.
 */
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    siteBackground?: "surface";
  }
}

const FRAME_BACKGROUND = "flex min-h-screen flex-col bg-background";
const FRAME_SURFACE = "flex min-h-screen flex-col bg-surface";

/**
 * Рама публичных страниц: шапка и подвал выше дочерних маршрутов, при переходе
 * между ними меняется только <Outlet/>. Полная высота — здесь: на короткой
 * странице `flex-1` прижимает подвал к низу экрана, на длинной подвал идёт
 * сразу после контента. Крошки, контейнеры и отступы остаются в страницах.
 *
 * Ключ PageTransition (смена pathname) стоит здесь, вокруг <Outlet/>, а не в
 * корне: при переходе между публичными страницами перемонтируется и въезжает
 * только содержимое под шапкой, шапка и подвал остаются теми же узлами.
 * Маршруты вне рамы (/admin, корневые 404 и страница ошибки) анимации
 * появления не имеют.
 */
export const Route = createFileRoute("/_site")({
  component: SiteLayout,
});

function SiteLayout() {
  const surface = useMatches({
    select: (matches) => matches.some((m) => m.staticData?.siteBackground === "surface"),
  });

  return (
    <div className={surface ? FRAME_SURFACE : FRAME_BACKGROUND}>
      <SiteHeader />
      <div className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </div>
      <SiteFooter />
    </div>
  );
}
