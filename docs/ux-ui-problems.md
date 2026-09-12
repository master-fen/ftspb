# Проблемы UX/UI

Список ведёт Антон по мере того, как замечает глазами. Здесь только «где и что»,
без решений — как должно быть, решается при разборе. Исправление отложено до этапа 7
(приёмка) осознанно: разделы ещё пишутся, приводить к единому виду раньше пришлось бы дважды.

- **Наведение на ссылку.** Оглавление Устава — синее, список событий — оранжевое
  (`hover:text-brand-orange`). Единого правила нет, цвет выбирается в каждом файле заново.
- **Размер заголовка h1.** Страница события — `text-3xl md:text-4xl lg:text-5xl
font-medium`; страница новости — `text-[28px] md:text-[36px] font-bold`. Разные шкала,
  насыщенность и способ задания.
- **Синие даты в списке событий** (`text-brand-navy`) выглядят чужеродно — нигде больше
  дата цветом не выделяется.
- **Страница 404 без рамы.** Несуществующий адрес рисует корневой `NotFoundComponent`
  (`src/routes/__root.tsx`): ни шапки, ни подвала, текст на английском («Page not found»,
  «Go home»).
- **Ссылка «Федерация» в подвале помечена текущей на всех страницах раздела.** На страницах под
  `/federation/…` она получает `aria-current="page"` (и класс `active`), хотя текущей страницей не
  является (`href="/federation"`, `src/components/site/SiteFooter.tsx:21`): без
  `activeOptions.exact` ссылка активна, если текущий путь начинается с её пути
  (`@tanstack/react-router`, `link.js:218–220`), а `/federation` — префикс всех страниц раздела.
- **Класс `active` у активных ссылок не определён.** `Link` без `activeProps` добавляет активной
  ссылке класс `active` (`link.js:374`) — на `/federation/structure` его получают две ссылки:
  пункт «Структура» бокового меню и «Федерация» в подвале. Правила для него нет: в `src/styles.css` (единственный CSS в `src`) `.active` не
  встречается, селекторов `[&.active]` и `data-[status=active]` в классах тоже нет.
- **Мета-теги `/federation/structure`.** Свои (`head()` страницы,
  `src/routes/_site.federation.structure.tsx:11–19`): `title`, `description`, `robots: noindex`,
  `og:title`, `og:description`. Общесайтовые (корневой `head()`, `src/routes/__root.tsx:78–117`):
  `og:url` — адрес главной, `twitter:title` и `twitter:description` — название и описание сайта,
  а также `og:type`, `og:site_name`, `og:locale`, `og:image`, `twitter:card`, `twitter:image`,
  `google-site-verification`, `charset`, `viewport`. `canonical` нет — ни у страницы, ни у
  `_site.tsx` и `_site.federation.tsx`, ни в корне.
