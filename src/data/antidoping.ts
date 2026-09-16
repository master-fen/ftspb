/** Дата в готовом виде, выводится как есть — без разбора через Date. */
export const ANTIDOPING_UPDATED_AT = "16.09.2026";

export const ANTIDOPING_RESPONSIBLE = {
  name: "Петров Пётр Петрович",
  position: "заместитель председателя Федерации тенниса Санкт-Петербурга",
  email: "antidoping@example.com",
  phone: "+7 (000) 000-00-00",
  phoneHref: "+70000000000",
};

export type AntidopingLink = {
  title: string;
  href: string;
  kind: "pdf" | "page";
  note?: string;
};

export type AntidopingGroup = {
  id: string;
  title: string;
  links: AntidopingLink[];
};

export const ANTIDOPING_GROUPS: AntidopingGroup[] = [
  {
    id: "violations",
    title: "Подробнее об ответственности",
    links: [
      {
        title: "Виды нарушений антидопинговых правил — РУСАДА",
        href: "https://rusada.ru/athletes/anti-doping-rules-violations/",
        kind: "page",
      },
      {
        title: "Последствия нарушений — Федерация тенниса России",
        href: "https://tennis-russia.ru/antidoping/narusheniya/posledstviya/",
        kind: "page",
      },
      {
        title: "Списки дисквалифицированных — РУСАДА",
        href: "https://rusada.ru/doping-control/disqualifications/",
        kind: "page",
      },
    ],
  },
  {
    id: "rules",
    title: "Нормативные документы",
    links: [
      {
        title: "Антидопинговая программа тенниса 2026 (ITIA), перевод на русский язык",
        href: "https://tennis-russia.ru/upload/iblock/eb6/eq2grw1awlmy16nomfy7xqaat19r2n21.pdf",
        kind: "pdf",
        note: "На сайте ФТР; неофициальный перевод ФТР, при расхождениях действует английский текст",
      },
      {
        title: "Tennis Anti-Doping Programme 2026 (ITIA), оригинал на английском",
        href: "https://tennis-russia.ru/upload/iblock/66e/4t03jgdqmp1uqjeb4fgpgcde76gks8pu.pdf",
        kind: "pdf",
        note: "На сайте ФТР",
      },
      {
        title: "Общероссийские антидопинговые правила, действующая редакция",
        href: "https://tennis-russia.ru/upload/iblock/73a/smmpkva2osnflj3zmobl793q6phzfngx.pdf",
        kind: "pdf",
        note: "На сайте ФТР, файл 2026 года, 32 МБ",
      },
      {
        title: "Запрещённый список 2026 (ВАДА), русский текст",
        href: "https://tennis-russia.ru/upload/iblock/478/2abs1u9lsmsip7nf8fv3amfiwopip7wt.pdf",
        kind: "pdf",
        note: "На сайте ФТР",
      },
      {
        title: "Запрещённый список — актуальная версия на сайте ВАДА",
        href: "https://www.wada-ama.org/en/prohibited-list",
        kind: "page",
      },
      {
        title:
          "Документы РУСАДА: Всемирный антидопинговый кодекс, международные стандарты, Общероссийские антидопинговые правила",
        href: "https://rusada.ru/documents/",
        kind: "page",
      },
      {
        title:
          "Федеральный закон от 4 декабря 2007 г. № 329-ФЗ «О физической культуре и спорте в Российской Федерации»",
        href: "https://tennis-russia.ru/upload/iblock/e16/50ignwyj2fdovc47zt9ltrmvaht1naws.pdf",
        kind: "pdf",
        note: "На сайте ФТР",
      },
      {
        title:
          "Методические рекомендации по совершенствованию механизмов ведения антидопинговой политики в субъектах Российской Федерации, общероссийских спортивных федерациях и региональных спортивных федерациях (приказ Минспорта России от 20 декабря 2021 г. № 998)",
        href: "https://tennis-russia.ru/upload/iblock/2a6/u3rrwhet0jc2n8wzkb1w5pp1rwzxe0qj.pdf",
        kind: "pdf",
        note: "На сайте ФТР",
      },
      {
        title:
          "Методические рекомендации по порядку информирования субъектов физической культуры и спорта о реализуемой антидопинговой политике, в том числе о последствиях нарушения антидопинговых правил (приказ Минспорта России от 15 декабря 2021 г. № 977)",
        href: "https://tennis-russia.ru/upload/iblock/c35/spbeiaf54aamz2u6wf95d4x326ms5qmg.pdf",
        kind: "pdf",
        note: "На сайте ФТР",
      },
      {
        title: "Полная нормативно-правовая база — Федерация тенниса России",
        href: "https://tennis-russia.ru/antidoping/osnovnoe/normativno-pravovaya-baza/",
        kind: "page",
      },
      {
        title: "Раздел «Антидопинговое обеспечение» Минспорта России",
        href: "https://minsport.gov.ru/open-ministry/anti-doping/",
        kind: "page",
      },
    ],
  },
  {
    id: "materials",
    title: "Памятки и справочные материалы",
    links: [
      {
        title:
          "Памятки и плакаты РУСАДА: антидопинговые правила, права спортсмена, процедура допинг-контроля, терапевтическое использование, Запрещённый список, БАДы, для тренеров, для родителей, дисквалифицированным спортсменам",
        href: "https://rusada.ru/education/materials/",
        kind: "page",
      },
      {
        title: "Разрешение на терапевтическое использование (ТИ): когда нужно и как оформить",
        href: "https://tennis-russia.ru/antidoping/zapreshchyennyy-spisok/razreshenie-na-terapevtichesoe-ispolzovanie/",
        kind: "page",
      },
      {
        title: "Процедура тестирования: как проходит допинг-контроль",
        href: "https://rusada.ru/athletes/test-procedure/",
        kind: "page",
      },
      {
        title:
          "Права спортсмена: памятка РУСАДА и Акт об антидопинговых правах спортсменов — Федерация тенниса России",
        href: "https://tennis-russia.ru/antidoping/igrokam/prava-i-obyazannosti-sportsmena/",
        kind: "page",
      },
    ],
  },
  {
    id: "services",
    title: "Сервисы",
    links: [
      {
        title: "Проверка препаратов на соответствие Запрещённому списку",
        href: "https://list.rusada.ru/",
        kind: "page",
        note: "Проверяйте каждый препарат до приёма",
      },
      {
        title: "Портал онлайн-образования РУСАДА: антидопинговый курс с сертификатом",
        href: "https://course.rusada.ru/",
        kind: "page",
        note: "Ежегодно для спортсменов, тренеров, медицинского и иного персонала",
      },
      {
        title: "Система ADAMS: описание, руководство пользователя и видеоинструкция",
        href: "https://rusada.ru/athletes/adams/",
        kind: "page",
      },
      {
        title: "Вход в систему ADAMS",
        href: "https://adams.wada-ama.org/",
        kind: "page",
      },
    ],
  },
  {
    id: "sites",
    title: "Официальные сайты",
    links: [
      { title: "РУСАДА", href: "https://rusada.ru/", kind: "page" },
      {
        title: "Минспорт России — Антидопинговое обеспечение",
        href: "https://minsport.gov.ru/open-ministry/anti-doping/",
        kind: "page",
      },
      {
        title: "Федерация тенниса России — Антидопинг",
        href: "https://tennis-russia.ru/antidoping/",
        kind: "page",
      },
      {
        title: "International Tennis Integrity Agency (ITIA)",
        href: "https://www.itia.tennis/",
        kind: "page",
      },
      {
        title: "Всемирное антидопинговое агентство (ВАДА)",
        href: "https://www.wada-ama.org/",
        kind: "page",
      },
    ],
  },
];

export const ANTIDOPING_REPORT_URL =
  "https://rusada.ru/doping-control/investigations/report-about-doping/";
