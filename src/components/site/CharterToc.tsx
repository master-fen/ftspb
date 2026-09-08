import { Link } from "@tanstack/react-router";
import { CHARTER_SECTION_TITLES } from "@/lib/charter/meta";

const sectionNumbers = Object.keys(CHARTER_SECTION_TITLES)
  .map(Number)
  .sort((a, b) => a - b);

const LINK_CLASS =
  "block rounded-md py-1 font-ui text-[15px] leading-6 text-foreground/65 transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue";

/**
 * Оглавление полного текста Устава: ссылки на разделы `${hrefBase}#razdel-N`.
 * Пустой `hrefBase` (по умолчанию) — якоря текущей страницы обычным `<a>`;
 * иначе — `Link` на внешнюю страницу с `hash`, чтобы переход был клиентским.
 */
export function CharterToc({
  className,
  hrefBase = "",
}: {
  className?: string;
  hrefBase?: string;
}) {
  return (
    <nav aria-label="Содержание Устава" className={className}>
      <ol className="space-y-1">
        {sectionNumbers.map((number) => {
          const label = `${number}. ${CHARTER_SECTION_TITLES[number]}`;
          return (
            <li key={number}>
              {hrefBase === "" ? (
                <a href={`#razdel-${number}`} className={LINK_CLASS}>
                  {label}
                </a>
              ) : (
                <Link to={hrefBase} hash={`razdel-${number}`} className={LINK_CLASS}>
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
