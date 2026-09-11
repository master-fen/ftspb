import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Загрузка следующей страницы начинается при наведении/фокусе на ссылку,
    // а не после клика.
    defaultPreload: "intent",
    // Данные публичных страниц (новости, события, документы) меняются редко:
    // минуту после загрузки loader на повторный заход не перезапускается.
    // Устаревшие данные показываются сразу и обновляются в фоне; по F5 — всегда
    // свежие (SSR без кэша). Админка читает данные через React Query, эти
    // настройки её не касаются. Для предзагрузки то же значение: повторное
    // наведение в течение минуты не шлёт новый запрос.
    defaultStaleTime: 60_000,
    defaultPreloadStaleTime: 60_000,
  });

  return router;
};
