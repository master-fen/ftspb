import { useEffect, useState } from "react";
import { Search, Menu, X, ChevronDown } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { navSections, type NavSection } from "@/data/mock";
import { Logo } from "./Logo";

function isSectionActive(section: NavSection, pathname: string): boolean {
  if (section.href.startsWith("/")) {
    if (section.href === "/") return pathname === "/";
    return pathname === section.href || pathname.startsWith(section.href + "/");
  }
  return false;
}

function NavLabel({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <span className="relative inline-flex flex-col items-center">
      <span>{label}</span>
      <span
        aria-hidden
        className={`mt-1.5 h-[2px] w-full rounded-full transition-opacity ${
          active ? "opacity-100" : "opacity-0"
        }`}
        style={{ backgroundColor: "var(--color-brand-blue)" }}
      />
    </span>
  );
}

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenu(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const linkClass =
    "text-sm font-bold text-brand-blue transition-colors hover:text-brand-orange";

  return (
    <header className="w-full bg-background">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2 md:px-6 md:py-2.5 lg:px-10">
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-7 lg:flex">
          {navSections.map((s) => {
            const active =
              isSectionActive(s, pathname) ||
              (s.children ? openMenu === s.label : false);

            if (s.children) {
              return (
                <div
                  key={s.label}
                  className="relative"
                  onMouseEnter={() => setOpenMenu(s.label)}
                  onMouseLeave={() =>
                    setOpenMenu((cur) => (cur === s.label ? null : cur))
                  }
                >
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={openMenu === s.label}
                    onClick={() =>
                      setOpenMenu((cur) => (cur === s.label ? null : s.label))
                    }
                    className={`${linkClass} inline-flex items-center gap-1`}
                  >
                    <NavLabel label={s.label} active={active} />
                  </button>
                </div>
              );
            }

            return s.href.startsWith("/") ? (
              <Link key={s.label} to={s.href} className={linkClass}>
                <NavLabel label={s.label} active={active} />
              </Link>
            ) : (
              <a key={s.label} href={s.href} className={linkClass}>
                <NavLabel label={s.label} active={active} />
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
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

      {/* Desktop submenu row — sits in flow so the orange bar drops with it */}
      {openMenu ? (
        <div
          className="hidden lg:block"
          onMouseEnter={() => setOpenMenu(openMenu)}
          onMouseLeave={() => setOpenMenu(null)}
        >
          <div className="mx-auto max-w-7xl px-4 pb-3 md:px-6 lg:px-10">
            <nav className="flex items-center justify-center gap-7">
              {navSections.map((s) => {
                if (s.label !== openMenu || !s.children) {
                  return <span key={s.label} className="invisible text-sm font-bold">{s.label}</span>;
                }
                return (
                  <div key={s.label} className="flex flex-col items-start gap-2">
                    {s.children.map((c) => (
                      <a
                        key={c.label}
                        href={c.href}
                        className="text-sm font-bold text-brand-blue transition-colors hover:text-brand-orange"
                      >
                        {c.label}
                      </a>
                    ))}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}

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
                      onClick={() =>
                        setMobileExpanded((cur) => (cur === s.label ? null : s.label))
                      }
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
