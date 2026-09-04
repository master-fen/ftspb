import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { FederationSidebar, findFederationItem } from "@/components/site/FederationSidebar";
import { Breadcrumbs, type Crumb } from "@/components/site/Breadcrumbs";
import { CharterPageAside } from "@/components/site/CharterPageAside";

export const Route = createFileRoute("/federation")({
  component: FederationLayout,
});

function FederationLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = pathname === "/federation" ? "/federation/about" : pathname;
  const item = findFederationItem(current);

  const crumbs: Crumb[] = [
    { label: "Главная", href: "/" },
    item ? { label: "Федерация", href: "/federation" } : { label: "Федерация" },
  ];
  if (item) crumbs.push({ label: item.label });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10">
        <Breadcrumbs items={crumbs} />

        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
          <div className="min-w-0 flex-1 lg:order-1">
            <Outlet />
          </div>
          <aside className="w-full shrink-0 lg:order-2 lg:w-[340px] xl:w-[413px]">
            <FederationSidebar />
            {current === "/federation/charter" ? <CharterPageAside /> : null}
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
