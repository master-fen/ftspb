
**Ничего в проекте не меняется.** Это ответ-инвентаризация по твоему списку. Где вопрос про поведение платформы Lovable — пишу «не могу проверить по файлам».

---

## A. Стек и сборка

**1. `package.json`** — TanStack Start (`@tanstack/react-start` 1.168, `@tanstack/react-router` 1.170), React 19, Vite 8, Tailwind 4, shadcn-набор Radix, Zod, react-hook-form, lucide, embla, sonner. Сборочный конфиг — `@lovable.dev/vite-tanstack-config` 2.7.7, `nitro` 3.0.260603-beta в devDependencies. Скрипты: `dev`, `build`, `build:dev`, `preview`, `lint`, `format`. (Полный листинг привёл выше в разборе; занимает ~60 строк, дублировать не буду — файл `package.json` в корне.)

**2. `vite.config.ts`** — целиком:
```ts
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
export default defineConfig({
  nitro: { preset: "node-server" },
});
```
Все плагины (tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro build-only, componentTagger dev-only) уже внутри `@lovable.dev/vite-tanstack-config` — конфиг это документирует комментарием.

**3. Серверный энтрипоинт.** Отдельного `server.ts` / `entry-server.tsx` / `ssr.tsx` **нет** — TanStack Start v1 не требует, SSR-шэлл собирает плагин. Есть `src/start.ts` (middleware для 500-страницы) и `src/router.tsx` (фабрика роутера с QueryClient). Корневой layout — `src/routes/__root.tsx` с `shellComponent: RootShell`, где отрисовываются `<html><head><HeadContent/></head><body>…<Scripts/></body></html>`.

**4. Lock-файлы:** только `bun.lock`. `package-lock.json` / `pnpm-lock.yaml` — нет.

**5. Дерево.** Корень: `.git`, `.gitignore`, `.lovable/`, `.prettierignore`, `.prettierrc`, `.tanstack/`, `.workspace/`, `AGENTS.md`, `bun.lock`, `bunfig.toml`, `components.json`, `eslint.config.js`, `node_modules/`, `package.json`, `public/`, `src/`, `tsconfig.json`, `vite.config.ts`.
`src/`: `assets/`, `components/` (`site/` + `ui/`), `data/`, `hooks/`, `lib/`, `routeTree.gen.ts`, `router.tsx`, `routes/`, `start.ts`, `styles.css`.

## B. Признаки рендеринга в коде

**6. Мета-теги.** Через TanStack Router `head()` в маршрутах. Пример из `src/routes/__root.tsx`:
```tsx
head: () => ({ meta: [
  { charSet: "utf-8" },
  { title: "Федерация тенниса Санкт-Петербурга" },
  { name: "description", content: "Официальный сайт …" },
  { property: "og:title", … }, { property: "og:type", content: "website" },
  { name: "twitter:card", content: "summary_large_image" }, …
] })
```
Локальные `head()` также в `src/routes/index.tsx` (нет, только компонент), `src/routes/news.index.tsx` (title/description/og) и `src/routes/news.$newsId.tsx` (динамические заголовки из `loaderData`, `robots: noindex` при not found). В шелле рендерится `<HeadContent />`.

**7. `public/`** — только `favicon.ico`. Файлов `robots.txt` и `sitemap.xml` **нет**.

**8. Функции загрузки данных на уровне маршрута.** Есть, `loader` в `src/routes/news.$newsId.tsx`:
```tsx
loader: ({ params }) => {
  const item = allNews.find((n) => n.id === params.newsId);
  if (!item) throw notFound();
  const related = allNews.filter((n) => n.id !== item.id).slice(0, 3);
  return { item, related };
}
```
`createServerFn` / `beforeLoad` в проекте **нет** (grep пуст).

## C. Что уже готово

**9. `src/routes/`:** `README.md`, `__root.tsx`, `index.tsx`, `news.$newsId.tsx`, `news.index.tsx`. Плюс автогенерируемый `src/routeTree.gen.ts` (рядом, но не в `routes/`).

**10.** Файлы `src/routes/news.index.tsx` и `src/routes/news.$newsId.tsx` привёл целиком выше в исследовании (список с фильтром по `?category=`, детальная с loader-ом, `dangerouslySetInnerHTML` для `body`, вложения и «Читайте также»). Оба используют `SiteHeader`/`SiteFooter` и импортируют `allNews` из `@/data/mock`.

**11. Данные по страницам.**
- `/` (`src/routes/index.tsx`) — рендерит `FeaturedNewsSection` и `LatestNewsSection`, они читают `featuredNews` / `latestNews` из `@/data/mock` → **захардкожено**.
- `/news` (`news.index.tsx`) — `allNews` из `@/data/mock` → **захардкожено**.
- `/news/$newsId` (`news.$newsId.tsx`) — `allNews.find(...)` в loader-е → **захардкожено**.

Внешних источников (`fetch`, API-клиента) нигде нет.

**12. Источник новостей** — `src/data/mock.ts`. Мокированные массивы `featuredNews`, `latestNews`, `allNews = [...featuredNews, ...latestNews]`, плюс типы `NewsItem`, `NewsCategory`, `NewsAttachment`, `NavSection`, `navSections`, `siteMeta`. Обложки — импорты картинок из `src/assets/`.

**13. Отдельного `src/lib/api.ts` нет.** В `src/lib/` только `error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts`, `utils.ts`. Запросов к API в проекте нет вообще.

**14. Маршруты и общие элементы.**
- Маршруты: `/`, `/news/`, `/news/$newsId`.
- Root layout: `src/routes/__root.tsx` (шапка/подвал внутри страниц, не в root).
- Общие компоненты (`src/components/site/`): `SiteHeader.tsx`, `SiteFooter.tsx`, `Logo.tsx`, `SectionHeading.tsx`, `NewsCard.tsx`, `FeaturedNewsSection.tsx`, `LatestNewsSection.tsx`.
- 404 — `NotFoundComponent` в `__root.tsx` (`notFoundComponent` рута) + `NewsNotFound` в `news.$newsId.tsx`.
- Error boundary — `ErrorComponent` в `__root.tsx`, `NewsError` в детальной новости.

## D. Бэкенд и данные

**15. Lovable Cloud / Supabase — нет.** `grep -r "supabase\|@supabase" src package.json` пусто. Папки `supabase/` нет, пакетов `@supabase/*` в `package.json` нет, клиента `src/integrations/supabase/*` нет.

**16. Env-файлы — нет.** `.env`, `.env.example` отсутствуют. Обращений к `process.env` / `import.meta.env.VITE_*` в `src/**/*.ts*` нет.

## E. Дизайн-система

**17. shadcn/ui установлен.** `components.json` есть (style `new-york`, baseColor `slate`, alias `@/components/ui`, icon `lucide`). В `src/components/ui/` лежат: accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip (47 файлов).

**18. Тема Tailwind — в `src/styles.css`.** Tailwind v4 через `@import "tailwindcss"` + `@theme inline { … }`. Кастомные токены:
```css
--color-brand-orange: var(--brand-orange);
--color-brand-blue:   var(--brand-blue);
--color-brand-navy:   var(--brand-navy);
--color-brand-navy-foreground: var(--brand-navy-foreground);
--font-sans: "Manrope", ui-sans-serif, system-ui, sans-serif;
--font-display: "Manrope", …;
--radius: 0.75rem; /* + sm/md/lg/xl/2xl derived */
```
Значения:
```css
--brand-orange: oklch(0.72 0.17 55);
--brand-blue:   oklch(0.42 0.12 245);
--brand-navy:   oklch(0.32 0.08 245);
--brand-navy-foreground: oklch(0.98 0.005 245);
```
Плюс стандартный shadcn-набор (`--background`, `--foreground`, `--primary`, `--muted`, …) и dark-тема через `.dark { … }`. Класс `.news-prose` в `@layer components` для оформления HTML-статей.

## F. Служебные файлы и правила

**19.**
- `.github/workflows/` — **нет** (папки `.github` нет).
- `CLAUDE.md` — **нет**.
- `AGENTS.md` — есть, содержимое:
  ```
  This project is connected to Lovable. Avoid rewriting published git history —
  force pushing, or rebasing/amending/squashing commits that are already pushed —
  as it rewrites history on Lovable's side and the user will likely lose their
  project history. Commits you push to the connected branch sync back to Lovable
  and show up in the editor, so keep the branch in a working state.
  ```
- `README.md` в корне — **нет**. Есть `src/routes/README.md` (правила файлового роутинга TanStack — конвенции имён, запрет `src/pages/`).
- `.lovable/` — есть, внутри `project.json`:
  ```json
  { "schemaVersion": 1, "template": "tanstack_start_ts_current",
    "revision": "tanstack_start_ts_current-6f0053eadbb1" }
  ```

**20. Автогенерируемые файлы, которые не редактируем вручную:**
- `src/routeTree.gen.ts` — в шапке файла: «This file was automatically generated by TanStack Router. You should NOT make any changes in this file…»
- `.tanstack/` — рабочий каталог TanStack (в `.gitignore` строка `.tanstack/**`).
- `node_modules/`, `dist/`, `dist-ssr/`, `.output/`, `.nitro/`, `.vinxi/` — по `.gitignore`.
- `bun.lock` — генерируется менеджером пакетов, руками не правится.

---

## Часть 2 — что я проверить не могу

По твоим пунктам 2.1–2.4 (view-source опубликованного сайта, настройки GitHub-интеграции в Lovable, направление синхронизации, история коммитов на GitHub) — **не могу проверить по файлам**. По коду видно, что маршрут детальной новости имеет `loader`, а рендер устроен через `HeadContent`/`Scripts` и `shellComponent` — то есть каркас для SSR стоит, но что реально отдаёт продакшен-хостинг Lovable на `ftspb.lovable.app`, нужно смотреть через `view-source` вручную.

---

Если по итогу инвентаризации захочешь что-то поменять — скажи, что именно (например: добавить `robots.txt`/`sitemap.xml`, вынести данные в `src/lib/api.ts`, включить Lovable Cloud) — тогда сделаю нормальный план изменений.
