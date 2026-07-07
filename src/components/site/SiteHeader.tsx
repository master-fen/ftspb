import { Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { navSections } from "@/data/mock";
import { Logo } from "./Logo";

export function SiteHeader() {
  return (
    <header className="w-full bg-background">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-5 lg:px-10">
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-7 lg:flex">
          {navSections.map((s) => (
            <a
              key={s.label}
              href={s.href}
              className="text-sm font-semibold text-brand-blue transition-colors hover:text-brand-orange"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <button
          type="button"
          aria-label="Поиск"
          className="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-blue text-primary-foreground transition-opacity hover:opacity-90 lg:ml-0"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
      <div
        className="h-[3px] w-full"
        style={{ backgroundColor: "var(--color-brand-orange)" }}
        aria-hidden
      />
    </header>
  );
}
