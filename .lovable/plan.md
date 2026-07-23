## Цель

Подключить Claude Code к тому же репозиторию параллельно с Lovable, без ломки Lovable-синхронизации. Topology A: Lovable пушит в `main` напрямую, Claude Code — через PR из веток `claude/*`.

## Что создаётся

### 1. `CLAUDE.md` в корне

- **Стек.** TanStack Start (`@tanstack/react-start` 1.168, `@tanstack/react-router` 1.170), React 19, **Vite 8** (`^8.0.16`), Tailwind 4, bun. Конфиг сборки — `@lovable.dev/vite-tanstack-config` 2.7.7, все плагины внутри. Nitro preset — `node-server`.
- **Менеджер пакетов — только bun.** Единственный lock — `bun.lock`. Команды: `bun install`, `bun run dev`, `bun run build`, `bun run build:dev`, `bun run lint`, `bun run format`, `bunx tsc --noEmit`, `bunx prettier --check .`. Никогда `npm`/`pnpm`/`yarn`.
- **Первичная настройка репозитория (один раз на клоне):**
  ```
  git config merge.ours.driver true
  ```
  Это объявляет драйвер `ours`, на который ссылается `.gitattributes` (встроенных драйверов у git всего три — `text`, `binary`, `union`; `ours` нужно объявлять локально). Конфиг не коммитится и на стороне Lovable не действует. **Поэтому основная защита `src/routeTree.gen.ts` — не `.gitattributes`, а обязательная регенерация: после каждого мерджа с `main` прогнать `bun run build:dev` и закоммитить обновлённый `routeTree.gen.ts` отдельным коммитом.**
- **Ветки.** Lovable синхронизируется с `main` двусторонне. Claude Code работает в `claude/<feature>` и вливается через PR. `main` не защищаем (Lovable пушит напрямую). Свои PR не апрувить — GitHub блокирует.
- **Запреты git.** Никаких `rebase`, `push --force`, `commit --amend`, `merge --squash` над уже запушенной историей. Синхронизация с `main` — только `git merge origin/main`. Ссылка на `AGENTS.md`.
- **Зоны ответственности:**
  - Lovable: `src/routes/*` (разметка/JSX/стили внутри маршрута), `src/components/**`, `src/styles.css`, `src/assets/**`, `src/data/mock.ts` (пока жив), `vite.config.ts`.
  - Claude Code: `src/lib/**` (появится `api.ts`, `types/` для доменных типов), `loader` и `head()` внутри route-файлов — отдельным коммитом с префиксом `chore(loader):`, `public/robots.txt`, `public/sitemap.xml`, `.github/workflows/**`, `CLAUDE.md`, `.gitattributes`, deploy-артефакты (`Dockerfile`, systemd-юнит, скрипт запуска `node .output/server/index.mjs`).
- **`src/data/mock.ts` — стратегия миграции:**
  - (а) **Перед удалением моков** типы `NewsItem`, `NewsCategory`, `NewsAttachment`, `NewsAttachmentKind`, `NavSection`, `NavChild` выносятся в отдельный файл (`src/lib/types/news.ts` и `src/lib/types/nav.ts`). Типы переживают моки и становятся основой доменной модели.
  - (б) **Fallback на моки при недоступном API не делаем.** Подмена данных скроет аварию; при ошибке — показываем error state / пустой список / сообщение об ошибке.
- **Не трогать руками:**
  - `src/routeTree.gen.ts` — автогенерация TanStack Router.
  - `.lovable/`, `.workspace/skills/` (последний сбрасывается на каждое сообщение Lovable).
  - `AGENTS.md` — файл полностью обёрнут маркерами `<!-- LOVABLE:BEGIN --> … <!-- LOVABLE:END -->`, редактируем только **снаружи** этих маркеров.
  - `src/routes/README.md`.
  - `src/lib/lovable-error-reporting.ts`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`.
  - `bun.lock` — только через `bun install` / `bun add`.
  - `vite.config.ts` — не добавлять плагины (всё внутри `@lovable.dev/vite-tanstack-config`); смена nitro preset — только по согласованию.
  - (`.tanstack/` из списка убран — уже покрыт `.gitignore`.)
- **Правила PR.** Один PR — одна зона. `loader`/`head()` — отдельным коммитом. Префиксы сообщений: `feat:`, `fix:`, `chore(loader):`, `chore(deploy):`, `chore(ci):`.
- **Локальные проверки перед пушем:** `bun run lint`, `bunx tsc --noEmit`, `bunx prettier --check .`, `bun run build`.

### 2. `.github/workflows/ci.yml`

Информационный (не блокирующий), запускается на `push` в `main` и на все `pull_request`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bunx prettier --check .
      - run: bunx tsc --noEmit
      - run: bun run build
```

Без required-status-checks на `main` — иначе прямые пуши Lovable упрутся в защиту.

### 3. `.gitattributes`

```
src/routeTree.gen.ts merge=ours linguist-generated=true
bun.lock linguist-generated=true
```

`merge=ours` работает только при выполненном `git config merge.ours.driver true` (см. шаг настройки в CLAUDE.md). На CI и у Lovable драйвер не объявлен — там `.gitattributes` для `routeTree.gen.ts` фактически no-op, поэтому регенерация после мерджа остаётся обязательной.

### 4. Проверка Prettier — до записи файлов

Перед созданием файлов запускаю `bunx prettier --check .` на текущем состоянии и **привожу фактический вывод команды** (не «зелёное»). Если проверка красная — пишу это в отчёт и уточняю с тобой, добавлять ли пути в `.prettierignore` или просить Lovable сделать одноразовый форматирующий коммит.

## Порядок применения (после переключения в build mode)

1. `bunx prettier --check .` — фактический вывод в отчёт.
2. Создаю `CLAUDE.md`, `.github/workflows/ci.yml`, `.gitattributes`.
3. Прогоняю `bun run lint`, `bunx tsc --noEmit`, `bunx prettier --check .`, `bun run build` — привожу **фактический stdout/stderr** каждой команды (последние строки при длинном выводе).
4. Если что-то красное — не «чиню молча», а показываю вывод и жду решения.

## Что НЕ входит

- Обкаточная задача (robots.txt + мелкая правка стилей) — следующим шагом, после того как Claude Code реально подключится.
- Смена схемы URL для новостей — отдельно.
- Deploy-конфиг (`Dockerfile`, systemd) — когда решится хостинг.
- Topology B — только если найдёшь переключатель в Lovable Labs, тогда доработаем `CLAUDE.md` и включим branch protection.
