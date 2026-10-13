import { createFileRoute, Outlet, useMatch, useRouterState } from "@tanstack/react-router";
import { CookieNotice } from "@/components/site/CookieNotice";
import { NewsPreviewBar, NewsShareBar } from "@/components/site/NewsPreviewBar";
import { PageTransition } from "@/components/site/PageTransition";
import { SearchPagePending } from "@/components/site/SearchPagePending";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { useDelayedFlag } from "@/lib/use-delayed-flag";

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
 * подвал (src/components/site/NewsPreviewBar.tsx). У страницы согласования по
 * ключу — своя полоса, без кнопки. На остальных страницах совпадения с
 * маршрутом предпросмотра нет, и рама ничего не рисует.
 *
 * Заглушка загрузки поиска — тоже здесь, а не `pendingComponent` маршрута
 * `/search`: та срабатывала бы и на переходах внутри поиска (вкладка, порядок,
 * год, листание) и прятала бы всю выдачу — прокрутка и фокус терялись бы
 * (docs/decisions.md, «Публичный поиск»). Рама показывает заглушку только при
 * входе на `/search` с другой страницы: роутер держит прежнюю страницу, пока
 * loader не ответит, и вместо неё через 200 мс видна заглушка, не меньше
 * 300 мс. Внутри поиска ожидание показывает сама страница.
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

  const enteringSearch = useRouterState({
    select: (s) =>
      s.isLoading &&
      s.location.pathname === "/search" &&
      s.resolvedLocation?.pathname !== "/search",
  });
  const searchSkeleton = useDelayedFlag(enteringSearch, 200, 300);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      {preview?.kind === "ok" ? (
        <NewsPreviewBar newsId={preview.newsId} state={preview.state} />
      ) : preview?.kind === "shared" ? (
        <NewsShareBar expiresOn={preview.expiresOn} />
      ) : null}
      <div className="flex-1">
        <PageTransition>{searchSkeleton ? <SearchPagePending /> : <Outlet />}</PageTransition>
      </div>
      <SiteFooter />
      <CookieNotice />
    </div>
  );
}
