import { useState } from "react";
import { Search, Menu, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { navSections } from "@/data/mock";
import { Logo } from "./Logo";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="w-full bg-background">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2 md:px-6 md:py-2.5 lg:px-10">
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-7 lg:flex">
          {navSections.map((s) =>
            s.href.startsWith("/") ? (
              <Link
                key={s.label}
                to={s.href}
                className="text-sm font-semibold text-brand-blue transition-colors hover:text-brand-orange [&.active]:text-brand-orange"
                activeProps={{ className: "active" }}
                activeOptions={{ exact: true }}
              >
                {s.label}
              </Link>
            ) : (
              <a
                key={s.label}
                href={s.href}
                className="text-sm font-semibold text-brand-blue transition-colors hover:text-brand-orange"
              >
                {s.label}
              </a>
            ),
          )}
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
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setOpen((v) => !v)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-blue text-primary-foreground transition-opacity hover:opacity-90 lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border bg-background lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-4 py-2">
            {navSections.map((s) =>
              s.href.startsWith("/") ? (
                <Link
                  key={s.label}
                  to={s.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-border py-3 text-base font-semibold text-brand-blue transition-colors last:border-b-0 hover:text-brand-orange"
                >
                  {s.label}
                </Link>
              ) : (
                <a
                  key={s.label}
                  href={s.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-border py-3 text-base font-semibold text-brand-blue transition-colors last:border-b-0 hover:text-brand-orange"
                >
                  {s.label}
                </a>
              ),
            )}
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
