import { Link } from "@tanstack/react-router";
import { paginationState } from "@/lib/news-paging";

type NewsPaginationProps = {
  /** Номер отданной страницы и число страниц — из loaderData (после clampPage), не из адреса. */
  page: number;
  pageCount: number;
};

/** Роль «Навигация» (text-sm font-medium) и «Текстовая ссылка» (ui-link). */
const LINK = "text-sm font-medium text-brand-navy ui-link";
const DISABLED = "text-sm font-medium text-muted-foreground";

/**
 * Управление лентой: «Назад», «Стр. N из M», «Вперёд» — одинаково на всех
 * ширинах, без номеров страниц и многоточия (решение Антона 19.09.2026).
 * Ссылки — `Link` с `to="."`: search текущего адреса (фильтр раздела)
 * сохраняется, меняется только `page`; первая страница остаётся без параметра
 * (stripSearchParams в маршруте). Номера абсолютные, от приведённой сервером
 * страницы: при `?page=99` лента показывает первую, и «Вперёд» ведёт на
 * вторую. `resetScroll` не задаётся: роутер сам ставит окно в начало страницы
 * (docs/decisions.md, правило про scrollRestoration). При одной странице
 * управление не рисуется.
 */
export function NewsPagination({ page, pageCount }: NewsPaginationProps) {
  if (pageCount <= 1) return null;
  const { prev, next, label } = paginationState(page, pageCount);

  return (
    <nav aria-label="Страницы" className="mt-10 flex items-center justify-center gap-6">
      {prev === null ? (
        <span aria-disabled="true" className={DISABLED}>
          <span aria-hidden>←</span> Назад
        </span>
      ) : (
        <Link to="." search={(current) => ({ ...current, page: prev })} className={LINK}>
          <span aria-hidden>←</span> Назад
        </Link>
      )}
      <span className="ui-caption">{label}</span>
      {next === null ? (
        <span aria-disabled="true" className={DISABLED}>
          Вперёд <span aria-hidden>→</span>
        </span>
      ) : (
        <Link to="." search={(current) => ({ ...current, page: next })} className={LINK}>
          Вперёд <span aria-hidden>→</span>
        </Link>
      )}
    </nav>
  );
}
