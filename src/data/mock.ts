import { archiveNews } from "@/data/news-archive";
import type { NewsItem } from "@/lib/types/news";
import type { NavSection } from "@/lib/types/nav";

const FEATURED_IDS = [
  "kubok-severnoy-stolitsy",
  "14-y-chempionat-sankt-peterburga-po-tennisu-sredi-veteranov",
  "match-sankt-peterburg-moskva",
] as const;

const featuredSet = new Set<string>(FEATURED_IDS);

export const allNews: NewsItem[] = archiveNews;

export const featuredNews: NewsItem[] = FEATURED_IDS.map((id) =>
  archiveNews.find((n) => n.id === id),
)
  .filter((n): n is NewsItem => Boolean(n))
  .map((n) => ({ ...n, featured: true }));

export const latestNews: NewsItem[] = archiveNews.filter((n) => !featuredSet.has(n.id)).slice(0, 6);

/**
 * Разделы верхнего уровня. `hidden: true` — скрыто до наполнения раздела
 * (страница пока ComingSoon с noindex): снять флаг вместе с noindex страницы и
 * вернуть запись в src/routes/sitemap[.]xml.ts. SiteHeader и SiteFooter читают
 * только `navSections` — уже отфильтрованный список.
 */
const ALL_SECTIONS: NavSection[] = [
  { label: "Новости", href: "/news" },
  {
    label: "Федерация",
    href: "/federation",
    children: [
      { label: "О Федерации", href: "/federation/about" },
      { label: "Деятельность", href: "/federation/news" },
    ],
  },
  { label: "Коллегия судей", href: "/referees", hidden: true },
  { label: "Сборные команды", href: "/teams", hidden: true },
  { label: "Турниры", href: "/tournaments", hidden: true },
  { label: "Корты", href: "/courts", hidden: true },
  { label: "Документы", href: "/documents", hidden: true },
  { label: "Контакты", href: "/contacts", hidden: true },
];

export const navSections: NavSection[] = ALL_SECTIONS.filter((s) => !s.hidden);

export const siteMeta = {
  name: "Федерация тенниса Санкт-Петербурга",
  shortName: "ФТ СПб",
  address: "193230, Санкт-Петербург, пер. Челиева, дом 13, корпус 3, литера Т, помещение 16",
  copyright: "Copyright © Федерация тенниса Санкт-Петербурга, 2026",
  legal: [
    { label: "Политика конфиденциальности", href: "/privacy" },
    { label: "Пользовательское соглашение", href: "/terms" },
  ],
};
