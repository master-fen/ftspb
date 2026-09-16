/**
 * Меню раздела «Федерация» — одни данные на боковую панель (FederationSidebar),
 * мобильный селектор со шторкой (FederationMobileNav) и блок «Ещё в разделе».
 * Отдельный модуль без компонентов: react-refresh требует, чтобы файл с
 * компонентом экспортировал только компоненты.
 */
export type FederationNavItem = { label: string; href: string };
export type FederationNavGroup = { label: string; items: FederationNavItem[] };

export const federationNav: FederationNavGroup[] = [
  {
    label: "О Федерации",
    items: [
      { label: "Общая информация", href: "/federation/about" },
      { label: "Руководство", href: "/federation/leadership" },
      { label: "Структура", href: "/federation/structure" },
      { label: "Устав", href: "/federation/charter" },
    ],
  },
  {
    label: "Деятельность",
    items: [
      { label: "Новости Федерации", href: "/federation/news" },
      { label: "События", href: "/federation/events" },
      { label: "Документы", href: "/federation/documents" },
      { label: "Антидопинг", href: "/federation/antidoping" },
    ],
  },
];

export function findFederationItem(pathname: string) {
  for (const group of federationNav) {
    const item = group.items.find((i) => i.href === pathname);
    if (item) return item;
  }
  return null;
}

/**
 * Адрес текущего пункта. Страницы вне раскладки раздела (событие, полный текст
 * Устава) передают его явно; `/federation` — это «Общая информация».
 */
export function currentFederationHref(pathname: string, activeHref?: string): string {
  return activeHref ?? (pathname === "/federation" ? "/federation/about" : pathname);
}

/** Группа и пункт по адресу текущего пункта; null, если адрес — не пункт меню. */
export function federationNavState(
  current: string,
): { group: FederationNavGroup; item: FederationNavItem } | null {
  for (const group of federationNav) {
    const item = group.items.find((i) => i.href === current);
    if (item) return { group, item };
  }
  return null;
}

/**
 * Меню без текущего пункта — блок «Ещё в разделе». Порядок групп и пунктов
 * прежний; группа остаётся, пока в ней есть хоть один пункт.
 */
export function otherFederationGroups(current: string): FederationNavGroup[] {
  return federationNav
    .map((group) => ({
      label: group.label,
      items: group.items.filter((i) => i.href !== current),
    }))
    .filter((group) => group.items.length > 0);
}
