/**
 * Маркер «на эту новость перешли из ленты (`/news` или `/federation/news`)» в
 * `history.state`: кнопка «Ко всем новостям» тогда идёт назад по истории, и
 * роутер возвращает ту же страницу ленты, фильтр и прокрутку. Без маркера
 * (прямой заход, главная, «Читайте также») кнопка — обычная ссылка.
 */
declare module "@tanstack/history" {
  interface HistoryState {
    fromNewsList?: true;
  }
}

type ClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export function shouldReturnToNewsList(
  state: { fromNewsList?: true },
  canGoBack: boolean,
  click: ClickLike,
): boolean {
  if (state.fromNewsList !== true || !canGoBack) return false;
  return click.button === 0 && !click.metaKey && !click.ctrlKey && !click.shiftKey && !click.altKey;
}
