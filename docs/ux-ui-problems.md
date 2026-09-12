# Проблемы UX/UI

Список ведёт Антон по мере того, как замечает глазами. Здесь только «где и что»,
без решений — как должно быть, решается при разборе. Исправление отложено до этапа 7
(приёмка) осознанно: разделы ещё пишутся, приводить к единому виду раньше пришлось бы дважды.

- **Наведение на ссылку.** Оглавление Устава — синее, список событий — оранжевое
  (`hover:text-brand-orange`). Единого правила нет, цвет выбирается в каждом файле заново.
- **Крошки — две независимые реализации.** Общий компонент
  `src/components/site/Breadcrumbs.tsx`: точки-разделители, зазор `gap-3`, наведение
  `hover:text-foreground`. Страница новости (`src/routes/_site.news.$newsId.tsx`) компонент
  не использует — своя разметка с иконкой `ChevronRight`, зазор `gap-1.5`, наведение
  `hover:text-brand-orange`.
- **Размер заголовка h1.** Страница события — `text-3xl md:text-4xl lg:text-5xl
font-medium`; страница новости — `text-[28px] md:text-[36px] font-bold`. Разные шкала,
  насыщенность и способ задания.
- **Синие даты в списке событий** (`text-brand-navy`) выглядят чужеродно — нигде больше
  дата цветом не выделяется.
- **Страница 404 без рамы.** Несуществующий адрес рисует корневой `NotFoundComponent`
  (`src/routes/__root.tsx`): ни шапки, ни подвала, текст на английском («Page not found»,
  «Go home»).
- **`aria-current="page"` на `/federation/structure` — у четырёх элементов.** Ссылка крошек
  «Федерация» (`href="/federation"`, `src/components/site/Breadcrumbs.tsx:20`); текущая крошка
  «Структура» — `<span>` без `href`, атрибут записан в разметке (`Breadcrumbs.tsx:24`); пункт
  «Структура» навигации раздела (`href="/federation/structure"`,
  `src/components/site/FederationSidebar.tsx:51`); ссылка «Федерация» в подвале
  (`href="/federation"`, `src/components/site/SiteFooter.tsx:21`). У трёх `Link` атрибут ставит
  роутер: без `activeOptions.exact` ссылка активна, если текущий путь начинается с её пути
  (`@tanstack/react-router`, `link.js:218–220`), а `/federation` — префикс всех страниц раздела.
  «Федерация» в шапке — кнопка раскрытия меню, не `Link`, атрибута у неё нет.
- **Класс `active` у активных ссылок не определён.** `Link` без `activeProps` добавляет активной
  ссылке класс `active` (`link.js:374`) — на `/federation/structure` его получают три ссылки из
  пункта выше. Правила для него нет: в `src/styles.css` (единственный CSS в `src`) `.active` не
  встречается, селекторов `[&.active]` и `data-[status=active]` в классах тоже нет.
- **Мета-теги `/federation/structure`.** Свои (`head()` страницы,
  `src/routes/_site.federation.structure.tsx:11–19`): `title`, `description`, `robots: noindex`,
  `og:title`, `og:description`. Общесайтовые (корневой `head()`, `src/routes/__root.tsx:78–117`):
  `og:url` — адрес главной, `twitter:title` и `twitter:description` — название и описание сайта,
  а также `og:type`, `og:site_name`, `og:locale`, `og:image`, `twitter:card`, `twitter:image`,
  `google-site-verification`, `charset`, `viewport`. `canonical` нет — ни у страницы, ни у
  `_site.tsx` и `_site.federation.tsx`, ни в корне.
