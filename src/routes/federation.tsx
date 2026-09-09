import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import type { Crumb } from "@/components/site/Breadcrumbs";
import { FederationSidebar, findFederationItem } from "@/components/site/FederationSidebar";
import { SectionFrame } from "@/components/site/SectionFrame";

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
    <SectionFrame crumbs={crumbs} aside={<FederationSidebar />}>
      <Outlet />
    </SectionFrame>
  );
}
