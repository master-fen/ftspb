import { navSections, siteMeta } from "@/data/mock";
import { Logo } from "./Logo";

export function SiteFooter() {
  const half = Math.ceil(navSections.length / 2);
  const col1 = navSections.slice(0, half);
  const col2 = navSections.slice(half);

  return (
    <footer className="bg-brand-navy text-brand-navy-foreground">
      <div className="mx-auto max-w-7xl px-6 pt-12 pb-8 lg:px-10">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[auto_1fr_1fr]">
          <div className="rounded-xl bg-white p-4">
            <Logo />
          </div>
          <FooterCol items={col1} />
          <FooterCol items={col2} />
        </div>

        <div className="mt-10 border-t border-white/15 pt-6">
          <div className="grid grid-cols-1 gap-3 text-xs text-white/75 md:grid-cols-2">
            <div className="space-y-1.5">
              <div>{siteMeta.address}</div>
              <div>{siteMeta.copyright}</div>
            </div>
            <div className="flex flex-col gap-1.5 md:items-start">
              {siteMeta.legal.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  className="transition-colors hover:text-brand-orange"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ items }: { items: { label: string; href: string }[] }) {
  return (
    <ul className="space-y-3 text-sm">
      {items.map((s) => (
        <li key={s.label}>
          <a
            href={s.href}
            className="font-medium text-white/90 transition-colors hover:text-brand-orange"
          >
            {s.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
