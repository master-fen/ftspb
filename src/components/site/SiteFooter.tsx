import { Link } from "@tanstack/react-router";
import { navSections, siteMeta } from "@/data/mock";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="bg-brand-navy text-brand-navy-foreground">
      <div className="mx-auto max-w-7xl px-4 pt-10 pb-8 md:px-6 md:pt-12 lg:px-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between md:gap-12">
          {/* Logo — on white plate to keep the navy PNG visible on navy footer */}
          <div className="inline-block shrink-0 self-start rounded-xl bg-white p-3 md:p-4">
            <Logo sizeClassName="h-32 md:h-44 lg:h-52" />
          </div>

          {/* Nav — right side */}
          <nav className="md:pt-2">
            <ul className="grid grid-cols-1 gap-x-12 gap-y-3 text-sm sm:grid-cols-2">
              {navSections.map((s) => (
                <li key={s.label}>
                  <Link
                    to={s.href}
                    className="font-ui font-bold text-white/90 transition-colors hover:text-brand-orange"
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 border-t border-white/15 pt-6">
          <div className="flex flex-col gap-2 text-xs text-white/75 md:hidden">
            {siteMeta.legal.map((l) => (
              <Link
                key={l.label}
                to={l.href}
                className="text-sm font-medium text-white/90 transition-colors hover:text-brand-orange"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-4 leading-relaxed">{siteMeta.address}</div>
            <div>{siteMeta.copyright}</div>
          </div>

          <div className="hidden grid-cols-2 gap-3 text-xs text-white/75 md:grid">
            <div className="space-y-1.5">
              <div>{siteMeta.address}</div>
              <div>{siteMeta.copyright}</div>
            </div>
            <div className="flex flex-col gap-1.5">
              {siteMeta.legal.map((l) => (
                <Link
                  key={l.label}
                  to={l.href}
                  className="transition-colors hover:text-brand-orange"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
