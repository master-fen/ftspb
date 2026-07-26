import { archiveNews } from "@/data/news-archive";
import type { NewsItem } from "@/lib/types/news";
import type { NavSection } from "@/lib/types/nav";

export const allNews: NewsItem[] = archiveNews;

export const featuredNews: NewsItem[] = allNews.slice(0, 3).map((n) => ({ ...n, featured: true }));

export const latestNews: NewsItem[] = allNews.slice(3, 9);

export const navSections: NavSection[] = [
  { label: "Новости", href: "/news" },
  {
    label: "Федерация",
    href: "#",
    children: [
      { label: "Мероприятия", href: "#" },
      { label: "Документы Федерации", href: "#" },
    ],
  },
  { label: "Коллегия судей", href: "#" },
  { label: "Сборные команды", href: "#" },
  { label: "Турниры", href: "#" },
  { label: "Корты", href: "#" },
  { label: "Документы", href: "#" },
  { label: "Контакты", href: "#" },
];

export const siteMeta = {
  name: "Федерация тенниса Санкт-Петербурга",
  shortName: "ФТ СПб",
  address: "193230, Санкт-Петербург, пер. Челиева, дом 13, корпус 3, литера Т, помещение 16",
  copyright: "Copyright © Федерация тенниса Санкт-Петербурга, 2026",
  legal: [
    { label: "Политика конфиденциальности", href: "#" },
    { label: "Пользовательское соглашение", href: "#" },
  ],
};
