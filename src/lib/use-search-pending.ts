import { useRouterState } from "@tanstack/react-router";

/**
 * Идёт переход на `/search` (новый запрос из шапки или формы страницы,
 * мобильная лупа, вкладка, листание): кнопки поиска показывают спиннер до
 * первого кадра ответа. Признак — `isLoading`, а не `status === "pending"`:
 * `status` на сервере не сбрасывается (его возвращает в `idle` только эффект
 * Transitioner на клиенте), и спиннер попал бы в SSR-разметку, разойдясь с
 * гидрацией; `isLoading` к рендеру на сервере уже `false`. Он же гаснет, когда
 * роутер показывает заглушку загрузки маршрута (`pendingComponent` поиска,
 * через `pendingMs`) — дальше ожидание показывает она.
 */
export function useSearchPending(): boolean {
  return useRouterState({ select: (s) => s.isLoading && s.location.pathname === "/search" });
}
