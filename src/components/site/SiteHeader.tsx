import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Search, Menu, X, ChevronDown } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { navSections } from "@/data/mock";
import type { NavSection } from "@/lib/types/nav";
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
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<{
    left: number;
    top: number;
    width: number;
    visible: boolean;
  }>({
    left: 0,
    top: 0,
    width: 0,
    visible: false,
  });

  const navRef = useRef<HTMLElement | null>(null);
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
    setIndicator({
      left: box.left - navBox.left,
      top: box.top - navBox.top + box.height + 8,
      width: box.width,
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
      if (e.key === "Escape") setOpenMenu(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const linkClass =
    "font-ui text-[16px] font-bold leading-[19.25px] whitespace-nowrap text-brand-blue transition-colors hover:text-brand-orange";

  return (
    <header className="w-full bg-background">
      <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4 px-4 pt-2 pb-2 md:px-6 md:pt-2.5 md:pb-2.5 lg:grid lg:grid-cols-[auto_1fr_auto] lg:items-start lg:justify-normal lg:px-10">
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>

        <nav
          ref={navRef}
          onMouseLeave={() => setHovered(null)}
          className="relative hidden min-w-0 flex-wrap items-center justify-center gap-4 lg:flex xl:gap-6"
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
                    className={linkClass}
                  >
                    {s.label}
                  </button>

                  {openMenu === s.label ? (
                    <div className="absolute top-full left-0 z-40 flex flex-col items-start gap-2 pt-4 pb-2 whitespace-nowrap">
                      {s.children.map((c) => (
                        <a
                          key={c.label}
                          href={c.href}
                          className="font-ui text-[16px] leading-[19.25px] font-bold text-brand-blue transition-colors hover:text-brand-orange"
                        >
                          {c.label}
                        </a>
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
                ref={setRef}
                onMouseEnter={() => setHovered(s.label)}
                className={linkClass}
              >
                {s.label}
              </Link>
            ) : (
              <a
                key={s.label}
                href={s.href}
                ref={setRef}
                onMouseEnter={() => setHovered(s.label)}
                className={linkClass}
              >
                {s.label}
              </a>
            );
          })}

          <span
            aria-hidden
            className="pointer-events-none absolute h-[2px] rounded-full transition-all duration-300 ease-out"
            style={{
              backgroundColor: "var(--color-brand-blue)",
              left: indicator.left,
              top: indicator.top,
              width: indicator.width,
              opacity: indicator.visible ? 1 : 0,
            }}
          />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 self-center lg:ml-0">
          <button
            type="button"
            aria-label="Поиск"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-blue text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setMobileOpen((v) => !v)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-blue text-primary-foreground transition-opacity hover:opacity-90 lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
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
                          <a
                            key={c.label}
                            href={c.href}
                            onClick={() => setMobileOpen(false)}
                            className="py-2 text-sm font-bold text-brand-blue transition-colors hover:text-brand-orange"
                          >
                            {c.label}
                          </a>
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
