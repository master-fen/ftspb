import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Menu } from "lucide-react";
import { currentFederationHref, federationNav, federationNavState } from "@/lib/federation-nav";

const LIST_ID = "federation-nav-list";

/*
 * Строки классов — литеральные и выбираются ветвлением, а не собираются из
 * кусков: сканер Tailwind читает исходник как текст.
 */
const LIST_ITEM =
  "relative flex min-h-12 items-center rounded-md px-4 font-ui text-lg text-foreground active:bg-muted";
const LIST_ITEM_CURRENT =
  "relative flex min-h-12 items-center rounded-md bg-nav-active px-4 font-ui text-lg font-medium text-foreground";

/**
 * Навигация раздела «Федерация» ниже lg (на lg — боковая панель
 * FederationSidebar): карточка-селектор под заголовком страницы, по нажатию
 * раскрывающая под собой весь список раздела в потоке страницы. Закрывается
 * выбором пункта, клавишей Esc и нажатием вне карточки.
 */
export function FederationMobileNav({ activeHref }: { activeHref?: string } = {}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const state = federationNavState(currentFederationHref(pathname, activeHref));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!state) return null;
  const { item } = state;

  return (
    <div
      ref={rootRef}
      className="mt-4 overflow-hidden rounded-xl bg-background font-ui ring-1 ring-border lg:hidden"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={LIST_ID}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue"
      >
        <Menu aria-hidden="true" className="h-6 w-6 shrink-0 text-foreground" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Навигация по разделу</span>
          <span className="text-lg font-medium text-foreground">{item.label}</span>
        </span>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-brand-blue"
        >
          <ChevronDown className={open ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
        </span>
      </button>

      <div id={LIST_ID} hidden={!open} className="border-t border-border px-2 pb-3">
        {federationNav.map((navGroup, index) => (
          <div key={navGroup.label}>
            {index > 0 ? <div className="mx-4 mt-2.5 mb-0.5 border-t border-border" /> : null}
            <p className="px-4 pt-3 pb-1 ui-caption">{navGroup.label}</p>
            <ul>
              {navGroup.items.map((navItem) => {
                const isCurrent = navItem.href === item.href;
                return (
                  <li key={navItem.href}>
                    <Link
                      to={navItem.href}
                      aria-current={isCurrent ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={isCurrent ? LIST_ITEM_CURRENT : LIST_ITEM}
                    >
                      {isCurrent ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-0 left-0 h-full w-1 rounded-l-md bg-brand-blue"
                        />
                      ) : null}
                      {navItem.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
