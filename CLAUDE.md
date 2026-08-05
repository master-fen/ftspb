# CLAUDE.md — правила для Claude Code в этом репозитории

Репозиторий синхронизируется с Lovable. Соседний файл — `AGENTS.md` (полностью обёрнут маркерами `<!-- LOVABLE:BEGIN --> … <!-- LOVABLE:END -->`, редактируется только снаружи маркеров).

## Стек

- TanStack Start 1.168 (`@tanstack/react-start`, `@tanstack/react-router` 1.170)
- React 19
- Vite **8.0.16**
- Tailwind 4
- Bun **1.3.3** (единственный менеджер пакетов; единственный lock — `bun.lock`)
- Nitro preset: `node-server` (деплой на обычный Node.js)
- Конфиг сборки: `@lovable.dev/vite-tanstack-config` 2.7.7 (все плагины внутри — не добавлять свои в `vite.config.ts`)

Команды: `bun install`, `bun run dev`, `bun run build`, `bun run build:dev`, `bun run lint`, `bun run format`, `bunx tsc --noEmit`, `bunx prettier --check .`. Никогда не использовать `npm`, `pnpm`, `yarn`.

## Топология Git (Topology A)

- Lovable пушит прямо в `main`. **Никаких «Lovable-веток» нет.**
- Claude Code работает в ветках `claude/<feature>` и вливает через PR в `main`.
- `main` **не защищаем** (branch protection). Иначе прямые пуши Lovable упрутся в защиту.
- Свои PR не апрувить — GitHub всё равно заблокирует.

### Запреты

Никаких `git rebase`, `git push --force`, `git commit --amend`, `git merge --squash` над уже запушенной историей. Это ломает синхронизацию с Lovable.

Синхронизация с `main` — только `git merge origin/main` (обычный merge-коммит).

### Первичная настройка клона (один раз)

```bash
git config merge.ours.driver true
```

Это объявляет драйвер `ours`, на который ссылается `.gitattributes` (встроенных драйверов у git всего три — `text`, `binary`, `union`; `ours` объявляется локально). Конфиг не коммитится и на стороне Lovable/CI не действует. Поэтому:

**После каждого мерджа с `main` обязательно:**

```bash
bun run build:dev
git add src/routeTree.gen.ts
git commit -m "chore: regenerate routeTree.gen.ts"
```

`.gitattributes merge=ours` — только страховка на локальном клоне.

## Локальные проверки перед пушем

```bash
bun run lint
bunx tsc --noEmit
bunx prettier --check .
bun run build
```

`tsc`, не `tsgo` — `tsgo` в devDependencies нет.

## Зоны ответственности

### Lovable

- `src/routes/*` — **только JSX / разметка / стили внутри маршрута**
- `src/components/**` — **кроме** согласованного точечного исключения ниже
- `src/styles.css`
- `src/assets/**`
- `src/data/mock.ts` (пока моки живы)
- `vite.config.ts`

**Исключение (согласовано 04.08.2026, PR B этапа 3):**
`src/components/site/FeaturedNewsSection.tsx` и `LatestNewsSection.tsx`
получают данные через проп `items?: NewsItem[]` (значение по умолчанию —
`featuredNews`/`latestNews` из `@/data/mock`, как раньше) — заполняет его
`loader` главной страницы (`src/routes/index.tsx`) через
`createServerFn`-обёртки в `src/lib/news-server-fn.ts`. Тронута только строка
источника данных, JSX/вёрстка/классы — нет. Прямой импорт `@/data/mock`
внутри этих двух файлов оставлен исключительно как дефолт пропса (превью
Lovable без loader'а и как safety-net при случайном откате) — **не
восстанавливать его как основной источник данных**. Дальше эти два файла — не
Lovable-зона без повторного согласования.

### Claude Code

- `src/lib/**` — в т.ч. `src/lib/types/**` и `src/lib/news-server-fn.ts`
- **`loader` и `head()` внутри route-файлов** — отдельным коммитом с префиксом `chore(loader):`. `head()` читает `loaderData`, разрывать их по владельцам вредно.
- `public/robots.txt`, `public/sitemap.xml`
- `.github/workflows/**`
- `CLAUDE.md`, `.gitattributes`
- Deploy-артефакты: `Dockerfile`, systemd-юниты, скрипт запуска `node .output/server/index.mjs`

**Важно про импорт содержимого `src/server` из route-файлов.** TanStack
Start собирает route-модули и в клиентский, и в серверный бандл — прямой
импорт чего-либо из `src/server` в файле из `src/routes` падает на сборке
(плагин `tanstack-start-core:import-protection` запрещает любой импорт из
директории `server` в клиентском окружении). Обход — `createServerFn` из
`@tanstack/react-start` в файле вне `src/server` (например,
`src/lib/news-server-fn.ts`): тело `.handler()` компилируется только в
серверный чанк, на клиенте остаётся RPC-заглушка. Route-файлы импортируют
такие обёртки, а не модули `src/server` напрямую.

## Правила PR

- Один PR — одна зона.
- `loader` / `head()` — отдельным коммитом внутри PR.
- Префиксы сообщений: `feat:`, `fix:`, `chore(loader):`, `chore(deploy):`, `chore(ci):`.

## Стратегия миграции `src/data/mock.ts`

1. ✅ **Сделано (Lovable).** Типы вынесены из `src/data/mock.ts`:
   - `NewsItem`, `NewsCategory`, `NewsAttachment` → `src/lib/types/news.ts`
   - `NavSection`, `NavChild` → `src/lib/types/nav.ts`
2. ✅ **Сделано (Lovable).** Импорты типов во всех компонентах и route-файлах переведены на `@/lib/types/*`; из `@/data/mock` импортируются только данные (`allNews`, `featuredNews`, `latestNews`, `navSections`, `siteMeta`).
3. ✅ **Сделано (Claude Code, PR B этапа 3, новости).** Не `src/lib/api.ts` —
   вместо REST/fetch-слоя `src/server/news.ts` (прямой доступ к БД через
   drizzle) читается loader'ами route-файлов через `createServerFn`-обёртки в
   `src/lib/news-server-fn.ts` (см. «Важно про импорт `src/server/**`» выше).
   Так короче цепочка (SSR-loader → БД, без лишнего HTTP-хопа) и креды
   БД/S3 физически не могут попасть в клиентский бандл. Для остальных типов
   данных (`navSections`, `siteMeta`) шаг 3 ещё не сделан — они по-прежнему
   из `@/data/mock`.
4. **Fallback на моки при недоступном API не делаем.** Подмена данных скроет
   аварию. При ошибке (БД настроена, но недоступна) — падать, не глотать
   ошибку в try/catch. **Исключение** — `DATABASE_URL` не задан вовсе (штатный
   режим превью Lovable, не авария): тогда `src/server/news.ts` явной
   проверкой (`db === null` из `src/db/client.ts`, не try/catch) отдаёт
   `mock.ts` как есть, без обращения к БД.

Исключение из зон: файлы `src/lib/types/**` уже созданы Lovable как часть шагов 1–2; дальше они в зоне Claude Code.

## CI

`.github/workflows/ci.yml` — **информационный, не блокирующий**. Запускается на `push` в `main` и на все `pull_request`. Прогоняет `lint`, `prettier --check`, `tsc --noEmit`, `build`.

Блокирующим CI становится только через branch protection / required status checks, которые здесь не включаем (см. «Топология Git»).

Версия bun в CI зафиксирована (`1.3.3`) — плавающий `bun-version: latest` однажды разойдётся с форматом `bun.lock` и уронит `--frozen-lockfile`.

## Не трогать руками

- `src/routeTree.gen.ts` — автогенерация TanStack Router.
- `.lovable/`, `.workspace/skills/` (последнее сбрасывается на каждое сообщение Lovable).
- `AGENTS.md` — только вне маркеров `<!-- LOVABLE:BEGIN --> … <!-- LOVABLE:END -->`.
- `src/routes/README.md`.
- `src/lib/lovable-error-reporting.ts`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`.
- `bun.lock` — только через `bun install` / `bun add`.
- `vite.config.ts` — не добавлять плагины (всё внутри `@lovable.dev/vite-tanstack-config`); смена nitro preset — только по согласованию.

## Зоны владения

- **Lovable**: публичные страницы и компоненты.
- **Claude Code**: `/admin`, `src/server/**`, `src/db/**`, `drizzle/**`, `scripts/**`.
- **Lovable не изменяет**: `src/routes/admin/**`, `src/server/**`, `src/db/**`, `drizzle/**`, `scripts/**`, `src/data/**`.
- Серверные npm-зависимости зоны Claude Code (не удалять и не менять версии без согласования): drizzle-orm, drizzle-kit, postgres, bcryptjs, @aws-sdk/client-s3. Раздел `scripts` в `package.json` — тоже зона Claude Code. Пакеты `@lovable.dev/*` — зона Lovable, не пиннить.
- Синхронизация — только через merge, без rebase и force-push.
- Guard в `src/routes/admin/_authed/route.tsx` — навигационный, не граница безопасности. Каждая серверная функция админки обязана проверять сессию самостоятельно: эндпоинты `createServerFn` вызываются по HTTP напрямую.
