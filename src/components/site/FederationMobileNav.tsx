import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, X } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { currentFederationHref, federationNav, federationNavState } from "@/lib/federation-nav";

const SHEET_ID = "federation-nav-sheet";

/*
 * Строки классов — литеральные и выбираются ветвлением, а не собираются из
 * кусков: сканер Tailwind читает исходник как текст.
 */
const BAR_HIDDEN =
  "fixed inset-x-0 top-0 z-40 hidden min-h-12 w-full items-center justify-between gap-3 bg-background px-4 py-2 text-left font-ui ring-1 ring-border lg:hidden";
const BAR_SHOWN =
  "fixed inset-x-0 top-0 z-40 flex min-h-12 w-full items-center justify-between gap-3 bg-background px-4 py-2 text-left font-ui ring-1 ring-border lg:hidden";
const SHEET_ITEM =
  "relative flex min-h-12 items-center rounded-md px-4 font-ui text-lg text-foreground active:bg-muted";
const SHEET_ITEM_CURRENT =
  "relative flex min-h-12 items-center rounded-md bg-nav-active px-4 font-ui text-lg font-medium text-foreground";

/**
 * Навигация раздела «Федерация» ниже lg (на lg — боковая панель
 * FederationSidebar): селектор под заголовком страницы, шторка Drawer со всем
 * меню и компактный бар у верха окна, пока селектор ушёл за верхнюю границу.
 *
 * Бар — в портале в body: обёртка страницы PageTransition держит transform, и
 * position: fixed внутри неё отсчитывался бы от обёртки, а не от окна. Портал
 * монтируется после гидрации — в SSR бара нет.
 */
export function FederationMobileNav({ activeHref }: { activeHref?: string } = {}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const state = federationNavState(currentFederationHref(pathname, activeHref));
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [barVisible, setBarVisible] = useState(false);
  const selectorRef = useRef<HTMLButtonElement | null>(null);
  // Кнопка, открывшая шторку (селектор или бар), — на неё возвращается фокус
  // после закрытия. Автовозврат Radix работает только через Dialog.Trigger.
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const selector = selectorRef.current;
    if (!selector) return;
    // Бар виден, когда селектор целиком ушёл выше окна. На lg селектор скрыт:
    // его прямоугольник нулевой (bottom = 0), и бар остаётся скрытым.
    const observer = new IntersectionObserver(([entry]) => {
      setBarVisible(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
    });
    observer.observe(selector);
    return () => observer.disconnect();
  }, []);

  if (!state) return null;
  const { group, item } = state;

  return (
    <>
      <button
        ref={selectorRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={SHEET_ID}
        onClick={(e) => {
          openerRef.current = e.currentTarget;
          setOpen(true);
        }}
        className="mt-4 flex min-h-16 w-full items-center justify-between gap-3 rounded-xl bg-background px-4 py-2.5 text-left font-ui ring-1 ring-border active:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue lg:hidden"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{group.label}</span>
          <span className="text-lg font-medium text-foreground">{item.label}</span>
        </span>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-brand-blue"
        >
          <ChevronDown className={open ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
        </span>
      </button>

      {mounted
        ? createPortal(
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={SHEET_ID}
              onClick={(e) => {
                openerRef.current = e.currentTarget;
                setOpen(true);
              }}
              className={barVisible ? BAR_SHOWN : BAR_HIDDEN}
            >
              <span className="min-w-0">
                <span className="text-xs text-muted-foreground">{`${group.label} · `}</span>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-brand-blue" />
            </button>,
            document.body,
          )
        : null}

      {/* autoFocus: в vaul 1.1.2 по умолчанию false — автофокус Radix
          отменяется, и фокус остаётся на триггере под aria-hidden. */}
      <Drawer open={open} onOpenChange={setOpen} autoFocus>
        <DrawerContent
          id={SHEET_ID}
          aria-modal="true"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            openerRef.current?.focus();
          }}
          className="px-2 pb-5"
        >
          <div className="flex items-center justify-between py-1.5 pr-2 pl-4">
            <DrawerTitle className="font-ui text-base font-semibold">
              Раздел «Федерация»
            </DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="Закрыть"
                className="flex h-11 w-11 items-center justify-center rounded-full text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </DrawerClose>
          </div>
          {federationNav.map((navGroup, index) => (
            <div key={navGroup.label}>
              {index > 0 ? <div className="mx-4 mt-2.5 mb-0.5 border-t border-border" /> : null}
              <p className="px-4 pt-2 pb-1 ui-caption">{navGroup.label}</p>
              <ul>
                {navGroup.items.map((navItem) => {
                  const isCurrent = navItem.href === item.href;
                  return (
                    <li key={navItem.href}>
                      <Link
                        to={navItem.href}
                        aria-current={isCurrent ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={isCurrent ? SHEET_ITEM_CURRENT : SHEET_ITEM}
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
        </DrawerContent>
      </Drawer>
    </>
  );
}
