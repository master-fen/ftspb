import { Link, useRouterState } from "@tanstack/react-router";

export type FederationNavItem = { label: string; href: string };
export type FederationNavGroup = { label: string; items: FederationNavItem[] };

export const federationNav: FederationNavGroup[] = [
  {
    label: "Федерация",
    items: [
      { label: "О федерации", href: "/federation/about" },
      { label: "Руководство", href: "/federation/leadership" },
      { label: "Структура", href: "/federation/structure" },
      { label: "Устав", href: "/federation/charter" },
    ],
  },
  {
    label: "Деятельность",
    items: [
      { label: "Новости", href: "/federation/news" },
      { label: "События", href: "/federation/events" },
      { label: "Документы", href: "/federation/documents" },
    ],
  },
];

export function findFederationCrumbs(pathname: string) {
  for (const group of federationNav) {
    const item = group.items.find((i) => i.href === pathname);
    if (item) return { group, item };
  }
  return null;
}

export function FederationSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = pathname === "/federation" ? "/federation/about" : pathname;

  return (
    <nav
      aria-label="Разделы Федерации"
      className="rounded-[30px] border border-brand-blue/10 bg-background px-0 py-6 md:py-8"
    >
      {federationNav.map((group) => (
        <div key={group.label} className="mb-6 last:mb-0">
          <h2 className="px-6 text-xl font-medium text-foreground md:text-2xl">{group.label}</h2>
          <ul className="mt-3">
            {group.items.map((item) => {
              const isActive = current === item.href;
              return (
                <li key={item.href} className="relative">
                  <Link
                    to={item.href}
                    className={`relative flex min-h-10 items-center rounded-[5px] px-6 text-base transition-colors md:text-lg ${
                      isActive
                        ? "bg-brand-blue/20 font-medium text-foreground"
                        : "text-foreground/60 hover:text-foreground"
                    }`}
                  >
                    {isActive ? (
                      <span
                        aria-hidden
                        className="absolute top-0 left-0 h-full w-[7px] rounded-l-[5px] bg-brand-blue"
                      />
                    ) : null}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
