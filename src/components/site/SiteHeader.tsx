import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Search, Menu, X, ChevronDown } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { navSections } from "@/data/mock";
import type { NavSection } from "@/lib/types/nav";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

function isSectionActive(section: NavSection, pathname: string): boolean {
  if (section.href.startsWith("/")) {
    if (section.href === "/") return pathname === "/";
    return pathname === section.href || pathname.startsWith(section.href + "/");
  }
  return false;
}

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number; visible: boolean }>({
    left: 0,
    width: 0,
    visible: false,
  });

  const navRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLFormElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const activeLabel = navSections.find((s) => isSectionActive(s, pathname))?.label ?? null;
  const target = hovered ?? openMenu ?? activeLabel;

  const measure = useCallback(() => {
    const nav = navRef.current;
    const el = target ? itemRefs.current[target] : null;
    if (!nav || !el) {
      setIndicator((prev) => ({ ...prev, visible: false }));
      return;
    }
    const navBox = nav.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);
    const paddingLeft = parseFloat(computed.paddingLeft) || 0;
    const paddingRight = parseFloat(computed.paddingRight) || 0;
    setIndicator({
      left: box.left - navBox.left + paddingLeft,
      width: box.width - paddingLeft - paddingRight,
      visible: true,
    });
  }, [target]);

  useLayoutEffect(() => {
    measure();
  }, [measure, pathname]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setSearchOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;

    searchInputRef.current?.focus();

    function onPointerDown(e: PointerEvent) {
      if (e.target instanceof Node && !searchRef.current?.contains(e.target)) {
        setSearchOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [searchOpen]);

  const navItemClass =
    "font-ui text-[15px] font-bold leading-[19.25px] text-brand-blue transition-colors hover:text-brand-orange inline-block text-center min-w-0 px-1 lg:px-1 lg:max-w-[7rem] xl:px-0 xl:text-[16px] xl:max-w-none";

  const dropdownItemClass =
    "font-ui text-[16px] leading-[19.25px] font-bold text-brand-blue transition-colors hover:text-brand-orange whitespace-nowrap";

  return (
    <header className="w-full bg-background">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 pt-2 pb-2 md:px-6 md:pt-2.5 md:pb-2.5 lg:gap-2 lg:px-10 xl:gap-4 xl:px-10">
        <Link to="/" className="shrink-0">
          <Logo sizeClassName="h-28 md:h-36 lg:h-40 xl:h-48" />
        </Link>

        <div className="relative hidden min-h-40 flex-1 self-stretch lg:block xl:min-h-48">
          <form
            ref={searchRef}
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              toast("Пока не готово");
            }}
            className={`absolute top-3 right-0 z-30 h-11 overflow-hidden rounded-full border-[3px] border-brand-blue bg-background transition-[width,box-shadow] duration-300 ease-out xl:top-4 ${
              searchOpen ? "w-64 shadow-sm" : "w-11"
            }`}
          >
            <label htmlFor="site-search" className="sr-only">
              Поиск по сайту
            </label>
            <input
              ref={searchInputRef}
              id="site-search"
              type="search"
              placeholder="Поиск…"
              tabIndex={searchOpen ? 0 : -1}
              className={`h-full w-full bg-transparent pr-12 pl-3 font-ui text-base font-bold text-brand-blue outline-none placeholder:text-brand-blue ${
                searchOpen ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            />
            <Button
              type="button"
              size="icon"
              aria-label={searchOpen ? "Найти" : "Открыть поиск"}
              aria-expanded={searchOpen}
              onClick={() => {
                if (searchOpen) {
                  toast("Пока не готово");
                  return;
                }
                setSearchOpen(true);
              }}
              className="absolute top-0 right-0 h-full w-10 rounded-full bg-brand-blue p-0 text-primary-foreground shadow-none hover:bg-brand-blue hover:opacity-90"
            >
              <Search className="h-4 w-4" />
            </Button>
          </form>

          <nav
            ref={navRef}
            onMouseLeave={() => setHovered(null)}
            className="absolute top-1/2 right-0 left-0 flex -translate-y-1/2 items-center justify-center gap-1 xl:gap-4"
          >
          {navSections.map((s) => {
            const setRef = (el: HTMLElement | null) => {
              itemRefs.current[s.label] = el;
            };

            if (s.children) {
              return (
                <div
                  key={s.label}
                  className="relative"
                  onMouseEnter={() => {
                    setHovered(s.label);
                    setOpenMenu(s.label);
                  }}
                  onMouseLeave={() => setOpenMenu((cur) => (cur === s.label ? null : cur))}
                >
                  <button
                    ref={setRef}
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={openMenu === s.label}
                    onClick={() => setOpenMenu((cur) => (cur === s.label ? null : s.label))}
                    className={navItemClass}
                  >
                    {s.label}
                  </button>

                  {openMenu === s.label ? (
                    <div className="absolute top-full left-0 z-40 flex flex-col items-start gap-2 pt-4 pb-2 whitespace-nowrap">
                      {s.children.map((c) =>
                        c.href.startsWith("/") ? (
                          <Link key={c.label} to={c.href} className={dropdownItemClass}>
                            {c.label}
                          </Link>
                        ) : (
                          <a key={c.label} href={c.href} className={dropdownItemClass}>
                            {c.label}
                          </a>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              );
            }

            return s.href.startsWith("/") ? (
              <Link
                key={s.label}
                to={s.href}
                ref={setRef}
                onMouseEnter={() => setHovered(s.label)}
                className={navItemClass}
              >
                {s.label}
              </Link>
            ) : (
              <a
                key={s.label}
                href={s.href}
                ref={setRef}
                onMouseEnter={() => setHovered(s.label)}
                className={navItemClass}
              >
                {s.label}
              </a>
            );
          })}

          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-2 h-[2px] rounded-full transition-all duration-300 ease-out"
            style={{
              backgroundColor: "var(--color-brand-blue)",
              left: indicator.left,
              width: indicator.width,
              opacity: indicator.visible ? 1 : 0,
            }}
          />
          </nav>
        </div>

        <div className="ml-auto flex items-center gap-2 self-center lg:hidden">
          <Button
            type="button"
            aria-label="Поиск"
            onClick={() => toast("Пока не готово")}
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full bg-brand-blue text-primary-foreground shadow-none transition-opacity hover:bg-brand-blue hover:opacity-90"
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setMobileOpen((v) => !v)}
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full bg-brand-blue text-primary-foreground shadow-none transition-opacity hover:bg-brand-blue hover:opacity-90"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="border-t border-border bg-background lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-4 py-2">
            {navSections.map((s) => {
              if (s.children) {
                const expanded = mobileExpanded === s.label;
                return (
                  <div key={s.label} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setMobileExpanded((cur) => (cur === s.label ? null : s.label))}
                      className="flex w-full items-center justify-between py-3 text-base font-bold text-brand-blue transition-colors hover:text-brand-orange"
                      aria-expanded={expanded}
                    >
                      <span>{s.label}</span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                    </button>
                    {expanded ? (
                      <div className="flex flex-col pb-2 pl-4">
                        {s.children.map((c) => (
                          <Link
                            key={c.label}
                            to={c.href}
                            onClick={() => setMobileOpen(false)}
                            className="py-2 text-sm font-bold text-brand-blue transition-colors hover:text-brand-orange"
                          >
                            {c.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }
              return s.href.startsWith("/") ? (
                <Link
                  key={s.label}
                  to={s.href}
                  onClick={() => setMobileOpen(false)}
                  className="border-b border-border py-3 text-base font-bold text-brand-blue transition-colors last:border-b-0 hover:text-brand-orange"
                >
                  {s.label}
                </Link>
              ) : (
                <a
                  key={s.label}
                  href={s.href}
                  onClick={() => setMobileOpen(false)}
                  className="border-b border-border py-3 text-base font-bold text-brand-blue transition-colors last:border-b-0 hover:text-brand-orange"
                >
                  {s.label}
                </a>
              );
            })}
          </nav>
        </div>
      ) : null}

      <div
        className="h-[3px] w-full"
        style={{ backgroundColor: "var(--color-brand-orange)" }}
        aria-hidden
      />
    </header>
  );
}
