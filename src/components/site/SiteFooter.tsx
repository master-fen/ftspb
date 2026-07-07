import { navSections, siteMeta } from "@/data/mock";
import { Logo } from "./Logo";

export function SiteFooter() {
  const half = Math.ceil(navSections.length / 2);
  const col1 = navSections.slice(0, half);
  const col2 = navSections.slice(half);

  return (
    <footer className="bg-brand-navy text-brand-navy-foreground">
      <div className="mx-auto max-w-7xl px-4 pt-10 pb-8 md:px-6 md:pt-12 lg:px-10">
        {/* Logo — on white plate to keep the navy PNG visible on navy footer */}
        <div className="inline-block rounded-xl bg-white p-4 md:p-5">
          <Logo sizeClassName="h-24 md:h-36" />
        </div>

        {/* Nav — stacked on mobile, two columns from md */}
        <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-2 md:mt-10 md:grid-cols-2">
          <FooterCol items={col1} />
          <FooterCol items={col2} />
        </div>

        <div className="mt-10 border-t border-white/15 pt-6">
          <div className="flex flex-col gap-2 text-xs text-white/75 md:hidden">
            {siteMeta.legal.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-sm font-medium text-white/90 transition-colors hover:text-brand-orange"
              >
                {l.label}
              </a>
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
