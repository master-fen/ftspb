import trophy from "@/assets/news-trophy.jpg";
import team from "@/assets/news-team.jpg";
import podium from "@/assets/news-podium.jpg";
import serve from "@/assets/news-serve.jpg";
import forehand from "@/assets/news-forehand.jpg";
import juniors from "@/assets/news-juniors.jpg";

export type NewsCategory =
  | "Турниры"
  | "Сборная"
  | "Федерация"
  | "Судьи"
  | "Клубы";

export type NewsItem = {
  id: string;
  category: NewsCategory;
  date: string; // dd.mm.yy
  title: string;
  excerpt?: string;
  cover: string;
};

export const featuredNews: NewsItem[] = [
  {
    id: "kubok-severnoy-stolitsy-2026",
    category: "Турниры",
    date: "08.05.26",
    title: "Кубок Северной Столицы 2026: открыта регистрация",
    excerpt: "Главный летний турнир города принимает заявки до 1 июня.",
    cover: trophy,
  },
  {
    id: "veterans-40-winners",
    category: "Турниры",
    date: "28.03.26",
    title: "Победители кубка ветеранов 40+",
    cover: team,
  },
  {
    id: "mens-team-roster",
    category: "Сборная",
    date: "07.05.26",
    title: "Объявлен расширенный состав мужской сборной",
    cover: podium,
  },
];

export const latestNews: NewsItem[] = [
  {
    id: "mens-team-roster-2",
    category: "Сборная",
    date: "07.05.26",
    title: "Объявлен расширенный состав мужской сборной",
    cover: serve,
  },
  {
    id: "womens-team-roster",
    category: "Сборная",
    date: "05.05.26",
    title: "Женская сборная провела учебно-тренировочный сбор",
    cover: forehand,
  },
  {
    id: "juniors-summer-camp",
    category: "Федерация",
    date: "02.05.26",
    title: "Летний лагерь для юниоров: старт заявочной кампании",
    cover: juniors,
  },
];

export type NavSection = { label: string; href: string };

export const navSections: NavSection[] = [
  { label: "Главная", href: "/" },
  { label: "Федерация", href: "#" },
  { label: "Сборные команды", href: "#" },
  { label: "Календарь турниров", href: "#" },
  { label: "Документы", href: "#" },
  { label: "Коллегия судей", href: "#" },
  { label: "Клубы города", href: "#" },
  { label: "Контакты", href: "#" },
];

export const siteMeta = {
  name: "Федерация тенниса Санкт-Петербурга",
  shortName: "ФТ СПб",
  address:
    "193230, Санкт-Петербург, пер. Челиева, дом 13, корпус 3, литера Т, помещение 16",
  copyright: "Copyright © Федерация тенниса Санкт-Петербурга, 2006",
  legal: [
    { label: "Политика конфиденциальности", href: "#" },
    { label: "Пользовательское соглашение", href: "#" },
  ],
};
