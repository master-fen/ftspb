import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { CookieNotice } from "@/components/site/CookieNotice";
import { NewsPreviewBar } from "@/components/site/NewsPreviewBar";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * Рама публичных страниц: шапка и подвал выше дочерних маршрутов, при переходе
 * между ними меняется только <Outlet/>. Полная высота — здесь: на короткой
 * странице `flex-1` прижимает подвал к низу экрана, на длинной подвал идёт
 * сразу после контента. Крошки, контейнеры и отступы остаются в страницах.
 *
 * Фон рамы один — `bg-background`, роль «фон страницы» (docs/style-rules.md,
 * «Поверхности»). Под рамой область между концом контента и подвалом на
 * короткой странице рисует сама рама (её `min-h-screen`), а не страница.
 *
 * Ключ PageTransition (смена pathname) стоит здесь, вокруг <Outlet/>, а не в
 * корне: при переходе между публичными страницами перемонтируется и въезжает
 * только содержимое под шапкой, шапка и подвал остаются теми же узлами.
 * Маршруты вне рамы (/admin, корневые 404 и страница ошибки) анимации
 * появления не имеют.
 *
 * Полоса-пометка предпросмотра новости (`/news/preview/ID`) — тоже здесь,
 * между шапкой и содержимым: её `sticky` должна жить до конца рамы, включая
 * подвал (src/components/site/NewsPreviewBar.tsx). На остальных страницах
 * совпадения с маршрутом предпросмотра нет, и рама ничего не рисует.
 */
export const Route = createFileRoute("/_site")({
  component: SiteLayout,
});

function SiteLayout() {
  const preview = useMatch({
    from: "/_site/news/preview/$previewId",
    shouldThrow: false,
    select: (match) => match.loaderData,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      {preview?.kind === "ok" ? (
        <NewsPreviewBar newsId={preview.newsId} state={preview.state} />
      ) : null}
      <div className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </div>
      <SiteFooter />
      <CookieNotice />
    </div>
  );
}
