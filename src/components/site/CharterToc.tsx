import { useEffect, useState, type MouseEvent } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { CHARTER_SECTION_TITLES, CHARTER_TEXT_PATH } from "@/lib/charter/meta";
import { scrollToAnchor } from "@/lib/scroll-to-hash";

const sectionNumbers = Object.keys(CHARTER_SECTION_TITLES)
  .map(Number)
  .sort((a, b) => a - b);

const LINK_CLASS =
  "block rounded-md py-1 font-ui text-[15px] leading-6 text-foreground/65 transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue";

/**
 * Поведение прокрутки к разделу: плавно, но при системной настройке
 * «уменьшить движение» — мгновенно. Начальное значение "smooth" общее для
 * сервера и первого рендера клиента (без обращения к `window`), настройка
 * читается уже после монтирования.
 */
function useScrollBehavior(): ScrollBehavior {
  const [behavior, setBehavior] = useState<ScrollBehavior>("smooth");
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBehavior("auto");
    }
  }, []);
  return behavior;
}

/**
 * Оглавление полного текста Устава: `Link` на `${hrefBase}#razdel-N`
 * (по умолчанию — страница полного текста, CHARTER_TEXT_PATH). В SSR это
 * обычный `href`, оглавление работает без JS. `includeHash` — чтобы на самой
 * странице текста активной считалась только ссылка текущего раздела, а не все
 * одиннадцать.
 *
 * Прокрутка зависит от того, ведёт ли ссылка на текущую страницу: `hrefBase`
 * сравнивается с `location.pathname` из состояния роутера.
 *
 * Та же страница (оглавление в колонке /federation/charter/text). Целевой
 * раздел уже в документе, поэтому роутеру прокрутка запрещена
 * (`hashScrollIntoView={false}`, `resetScroll={false}`) и её делает
 * `scrollToAnchor` — за фиксированные 300 мс вместо неуправляемой
 * длительности нативного `scrollIntoView`. Обработчик срабатывает и на
 * повторном клике по уже активному пункту, когда URL не меняется и навигации
 * нет.
 *
 * Другой маршрут (витрина Устава /federation/charter). Целевого элемента в
 * момент клика не существует — прокручивать нечего; остаётся поведение
 * роутера по умолчанию: `hashScrollIntoView` после перехода, плавно или
 * мгновенно по системной настройке.
 */
export function CharterToc({
  className,
  hrefBase = CHARTER_TEXT_PATH,
}: {
  className?: string;
  hrefBase?: string;
}) {
  const behavior = useScrollBehavior();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const samePage = pathname === hrefBase;

  // Клик с модификатором или не левой кнопкой — открытие в новой вкладке:
  // своя прокрутка тут не нужна и помешала бы. Проверять `defaultPrevented`
  // здесь нельзя: `Link` вызывает `preventDefault()` для клиентского перехода
  // раньше этого обработчика, и такой guard глушил бы прокрутку всегда.
  const handleClick = (event: MouseEvent<HTMLAnchorElement>, number: number) => {
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    scrollToAnchor(`razdel-${number}`);
  };

  return (
    <nav aria-label="Содержание Устава" className={className}>
      <ol className="space-y-1">
        {sectionNumbers.map((number) => (
          <li key={number}>
            <Link
              to={hrefBase}
              hash={`razdel-${number}`}
              hashScrollIntoView={samePage ? false : { behavior, block: "start" }}
              resetScroll={samePage ? false : undefined}
              onClick={samePage ? (event) => handleClick(event, number) : undefined}
              activeOptions={{ includeHash: true }}
              className={LINK_CLASS}
            >
              {`${number}. ${CHARTER_SECTION_TITLES[number]}`}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
