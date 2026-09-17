import { Link } from "@tanstack/react-router";

export type Crumb = { label: string; href?: string };

/**
 * Хлебные крошки. Ряд по-прежнему переносится по ширине — но между пунктами, а
 * не внутри пункта: отдельная крошка в две строки не переносится, длинная
 * подпись (заголовок новости или события) обрезается многоточием по ширине
 * строки. docs/style-rules.md, «Крошки».
 *
 * Обрезку дают три класса, каждый обязателен:
 *
 * - `truncate` на подписи — `white-space: nowrap` плюс `overflow: hidden` и
 *   `text-overflow: ellipsis`: переноситься нечему, лишнее заменяется на «…».
 * - `min-w-0` на обёртке пункта — без него флекс-элемент не сжимается ниже
 *   ширины содержимого (`min-width: auto`) и вместо обрезки вылезает за
 *   контейнер.
 * - `shrink-0` на точке — сжимается только подпись, разделитель остаётся целым.
 *
 * Многоточие получает ровно тот пункт, которому не хватило строки: во флекс-ряду
 * с `flex-wrap` строка набирается по несжатым размерам пунктов, и сжатие
 * включается только там, где пункт не помещается в строку целиком — то есть у
 * длинного пункта, уехавшего на свою строку. Короткие пункты рядом обрезку не
 * ловят.
 *
 * В DOM подпись остаётся целой: обрезка визуальная, скринридер читает её
 * полностью, копирование выделения даёт полный текст.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Хлебные крошки"
      className="mb-4 flex flex-wrap items-center gap-3 text-sm leading-8 font-medium text-foreground/40 md:mb-5"
    >
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-3">
          {i > 0 ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full bg-breadcrumb-dot"
              aria-hidden="true"
            />
          ) : null}
          {item.href ? (
            <Link to={item.href} activeOptions={{ exact: true }} className="truncate ui-link">
              {item.label}
            </Link>
          ) : (
            <span className="truncate" aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
