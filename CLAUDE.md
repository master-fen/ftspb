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
- `src/components/**`
- `src/styles.css`
- `src/assets/**`
- `src/data/mock.ts` (пока моки живы)
- `vite.config.ts`

### Claude Code

- `src/lib/**` — в т.ч. будущие `src/lib/api.ts` и `src/lib/types/**`
- **`loader` и `head()` внутри route-файлов** — отдельным коммитом с префиксом `chore(loader):`. `head()` читает `loaderData`, разрывать их по владельцам вредно.
- `public/robots.txt`, `public/sitemap.xml`
- `.github/workflows/**`
- `CLAUDE.md`, `.gitattributes`
- Deploy-артефакты: `Dockerfile`, systemd-юниты, скрипт запуска `node .output/server/index.mjs`

## Правила PR

- Один PR — одна зона.
- `loader` / `head()` — отдельным коммитом внутри PR.
- Префиксы сообщений: `feat:`, `fix:`, `chore(loader):`, `chore(deploy):`, `chore(ci):`.

## Стратегия миграции `src/data/mock.ts`

1. ✅ **Сделано (Lovable).** Типы вынесены из `src/data/mock.ts`:
   - `NewsItem`, `NewsCategory`, `NewsAttachment` → `src/lib/types/news.ts`
   - `NavSection`, `NavChild` → `src/lib/types/nav.ts`
2. ✅ **Сделано (Lovable).** Импорты типов во всех компонентах и route-файлах переведены на `@/lib/types/*`; из `@/data/mock` импортируются только данные (`allNews`, `featuredNews`, `latestNews`, `navSections`, `siteMeta`).
3. **Владелец — Claude Code.** Написать `src/lib/api.ts` поверх типов из `src/lib/types/**` и подключить его через `loader` в route-файлах (`chore(loader):`).
4. **Fallback на моки при недоступном API не делаем.** Подмена данных скроет аварию. При ошибке — error state / пустой список / сообщение об ошибке.

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
