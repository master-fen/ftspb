import { useRouterState } from "@tanstack/react-router";

/**
 * Идёт переход роутера на `/search` (новый запрос из шапки,
 * мобильная лупа, вкладка, листание): кнопки поиска показывают спиннер до
 * первого кадра ответа. Признак — `isLoading`, а не `status === "pending"`:
 * `status` на сервере не сбрасывается (его возвращает в `idle` только эффект
 * Transitioner на клиенте), и спиннер попал бы в SSR-разметку, разойдясь с
 * гидрацией; `isLoading` к рендеру на сервере уже `false`. У маршрута
 * `/search` нет `pendingComponent`, поэтому `isLoading` держится до ответа
 * целиком; заглушку при входе с другой страницы рисует рама `_site`
 * (src/routes/_site.tsx), выдачу при переходе внутри поиска приглушает
 * страница.
 */
export function useSearchPending(): boolean {
  return useRouterState({ select: (s) => s.isLoading && s.location.pathname === "/search" });
}
