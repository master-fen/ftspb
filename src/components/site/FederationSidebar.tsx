import { Link, useRouterState } from "@tanstack/react-router";
import { currentFederationHref, federationNav, otherFederationGroups } from "@/lib/federation-nav";

/*
 * Строки классов пунктов блока «Ещё» — литеральные и выбираются ветвлением:
 * сканер Tailwind читает исходник как текст. У последней группы нижней
 * границы нет у последнего пункта.
 */
const MORE_ITEM = "border-b border-border";
const MORE_ITEM_LAST_GROUP = "border-b border-border last:border-b-0";

/**
 * Навигация раздела «Федерация». На lg — панель в правой колонке; ниже lg
 * панель не рисуется (её заменяет FederationMobileNav под заголовком), а на
 * её месте в потоке стоит блок «Ещё в разделе» — все пункты, кроме текущего.
 */
export function FederationSidebar({ activeHref }: { activeHref?: string } = {}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = currentFederationHref(pathname, activeHref);
  const others = otherFederationGroups(current);

  return (
    <>
      <nav
        aria-label="Разделы Федерации"
        className="hidden rounded-[30px] border border-panel-border bg-panel px-0 py-6 md:py-8 lg:block"
      >
        {federationNav.map((group) => (
          <div key={group.label} className="mb-6 last:mb-0">
            <h2 className="px-6 ui-caption">{group.label}</h2>
            <ul className="mt-3">
              {group.items.map((item) => {
                const isActive = current === item.href;
                return (
                  <li key={item.href} className="relative">
                    <Link
                      to={item.href}
                      className={`relative flex min-h-10 items-center rounded-[5px] px-6 text-base md:text-lg ${
                        isActive
                          ? "bg-nav-active font-medium text-foreground transition-colors"
                          : "text-foreground/60 ui-link"
                      }`}
                    >
                      {isActive ? (
                        <span
                          aria-hidden
                          className="absolute top-0 left-0 h-full w-[7px] rounded-l-[5px] bg-brand-blue"
                        />
                      ) : null}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <nav
        aria-labelledby="federation-more-title"
        className="border-t border-border pt-5 lg:hidden"
      >
        <h2 id="federation-more-title" className="ui-h3">
          Ещё в разделе «Федерация»
        </h2>
        {others.map((group, index) => (
          <div key={group.label} className={index === 0 ? "mt-1.5" : "mt-3"}>
            <p className="py-1 ui-caption">{group.label}</p>
            <ul>
              {group.items.map((item) => (
                <li
                  key={item.href}
                  className={index === others.length - 1 ? MORE_ITEM_LAST_GROUP : MORE_ITEM}
                >
                  <Link
                    to={item.href}
                    className="flex min-h-11 items-center text-base text-brand-blue ui-link"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
