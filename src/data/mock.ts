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

export type NewsAttachment = {
  kind: "PDF" | "DOC" | "XLS";
  title: string;
  size?: string;
};

export type NewsItem = {
  id: string;
  category: NewsCategory;
  date: string; // dd.mm.yy
  title: string;
  excerpt?: string;
  body?: string[];
  attachments?: NewsAttachment[];
  cover: string;
  featured?: boolean;
};

export const featuredNews: NewsItem[] = [
  {
    id: "kubok-severnoy-stolitsy-2026",
    category: "Турниры",
    date: "08.05.26",
    title: "Кубок Северной Столицы 2026: открыта регистрация",
    excerpt:
      "Главный летний турнир города принимает заявки до 1 июня. Призовой фонд увеличен в полтора раза, добавлены парные разряды и микст. Соревнования пройдут на трёх площадках, финалы — на центральном корте.",
    body: [
      "Кубок Северной Столицы — крупнейший летний рейтинговый турнир города. В сезоне 2026 года организаторы расширили программу: помимо одиночных разрядов, в сетку добавлены парные категории и микст. Соревнования пройдут с 15 по 28 июня на трёх клубных площадках, финальные матчи — на центральном корте Приморского клуба.",
      "Призовой фонд увеличен в полтора раза по сравнению с прошлым сезоном. Распределение — по утверждённой шкале для каждой категории. Полный список номинаций и таблица призовых опубликованы в регламенте турнира.",
      "К участию допускаются игроки, имеющие действующий рейтинг федерации и подтверждённое медицинское заключение. Заявки принимаются онлайн через личный кабинет на сайте федерации до 23:59 1 июня. Жеребьёвка состоится 5 июня в офисе федерации, прямая трансляция — в официальном канале.",
      "Тренерский совет рекомендует игрокам и сопровождающим заранее ознакомиться с обновлённой редакцией регламента: внесены изменения в порядок разминки, правила подачи протестов и формат парных матчей.",
    ],
    attachments: [
      { kind: "PDF", title: "Регламент Кубка Северной Столицы 2026", size: "420 КБ" },
      { kind: "PDF", title: "Положение о призовом фонде", size: "180 КБ" },
      { kind: "DOC", title: "Форма заявки участника" },
    ],
    cover: trophy,
    featured: true,
  },
  {
    id: "veterans-40-winners",
    category: "Турниры",
    date: "28.03.26",
    title: "Победители кубка ветеранов 40+",
    excerpt:
      "В список вошли 12 игроков. Финальный состав будет утверждён за две недели до старта.",
    cover: team,
    featured: true,
  },
  {
    id: "mens-team-roster",
    category: "Сборная",
    date: "07.05.26",
    title: "Объявлен расширенный состав мужской сборной",
    excerpt:
      "Финальный матч продлился три часа и завершился победой действующего чемпиона.",
    cover: podium,
    featured: true,
  },
];

export const latestNews: NewsItem[] = [
  {
    id: "mens-team-roster-2",
    category: "Сборная",
    date: "07.05.26",
    title: "Объявлен расширенный состав мужской сборной",
    excerpt:
      "Финальный матч продлился три часа и завершился победой действующего чемпиона.",
    cover: serve,
  },
  {
    id: "womens-team-roster",
    category: "Сборная",
    date: "05.05.26",
    title: "Женская сборная провела учебно-тренировочный сбор",
    excerpt:
      "На двухнедельные сборы приехали 14 спортсменок, включая четырёх дебютанток основы.",
    cover: forehand,
  },
  {
    id: "juniors-summer-camp",
    category: "Федерация",
    date: "02.05.26",
    title: "Летний лагерь для юниоров: старт заявочной кампании",
    excerpt:
      "Приём заявок открыт до 20 мая, количество мест ограничено — по 24 участника в каждой возрастной группе.",
    cover: juniors,
  },
  {
    id: "referees-seminar",
    category: "Судьи",
    date: "20.04.26",
    title: "Семинар коллегии судей: новые правила сезона",
    excerpt:
      "Разбор изменений регламента и практикум по спорным ситуациям на корте.",
    cover: team,
  },
  {
    id: "clubs-new-courts",
    category: "Клубы",
    date: "15.04.26",
    title: "В городе открылись два новых грунтовых корта",
    excerpt:
      "Оба корта построены по международному стандарту и уже доступны для бронирования.",
    cover: trophy,
  },
  {
    id: "federation-meeting",
    category: "Федерация",
    date: "10.04.26",
    title: "Итоги отчётного собрания Федерации",
    excerpt:
      "Приняты приоритеты сезона: развитие детского тенниса, судейская школа и обновление календаря.",
    cover: podium,
  },
];

export const allNews: NewsItem[] = [...featuredNews, ...latestNews];

export type NavSection = { label: string; href: string };

export const navSections: NavSection[] = [
  { label: "Главная", href: "/" },
  { label: "Новости", href: "/news" },
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
