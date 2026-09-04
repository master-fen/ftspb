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

export const navSections: NavSection[] = [
  { label: "Новости", href: "/news" },
  {
    label: "Федерация",
    href: "/federation",
    children: [
      { label: "Общая информация", href: "/federation/about" },
      { label: "Новости Федерации", href: "/federation/news" },
    ],
  },
  { label: "Коллегия судей", href: "/referees" },
  { label: "Сборные команды", href: "/teams" },
  { label: "Турниры", href: "/tournaments" },
  { label: "Корты", href: "/courts" },
  { label: "Документы", href: "/documents" },
  { label: "Контакты", href: "/contacts" },
];

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
