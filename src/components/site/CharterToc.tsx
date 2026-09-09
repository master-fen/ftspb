import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CHARTER_SECTION_TITLES, CHARTER_TEXT_PATH } from "@/lib/charter/meta";

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
 * обычный `href`, оглавление работает без JS; с JS переход клиентский, а
 * `hashScrollIntoView` прокручивает к разделу (якоря в CharterText несут
 * `scroll-mt-24`, шапка заголовок не перекрывает). `includeHash` — чтобы на
 * самой странице текста активной считалась только ссылка текущего раздела,
 * а не все одиннадцать.
 */
export function CharterToc({
  className,
  hrefBase = CHARTER_TEXT_PATH,
}: {
  className?: string;
  hrefBase?: string;
}) {
  const behavior = useScrollBehavior();

  return (
    <nav aria-label="Содержание Устава" className={className}>
      <ol className="space-y-1">
        {sectionNumbers.map((number) => (
          <li key={number}>
            <Link
              to={hrefBase}
              hash={`razdel-${number}`}
              hashScrollIntoView={{ behavior, block: "start" }}
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
