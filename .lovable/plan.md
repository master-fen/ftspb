## Комбинированный подход к Prettier + Topology A (все правки внесены)

### Шаг 0. Расширить `.prettierignore`

Текущий файл уже содержит `routeTree.gen.ts` (без пути — покрывает файл в любой директории) и `bun.lock`. Добавляем только недостающее:

```
.lovable/
AGENTS.md
src/routes/README.md
```

`src/routeTree.gen.ts` дублировать не нужно — покрыт существующей строкой `routeTree.gen.ts`.

### Шаг 1. Одноразовый форматирующий коммит

```
bunx prettier --write .
```

Список изменённых файлов из вывода приведу в отчёте. Коммит только с форматированием, без других правок.

### Шаг 2. Проверка + честный отчёт по exit code

```
bunx prettier --check .
echo $?
```

Дословно stdout+stderr и exit-код отдельной строкой. Про противоречие из прошлого отчёта (exit 0 при 12 файлах) — не выдумываю причину, назову по факту после запуска.

### Шаг 3. CI сохраняет `bunx prettier --check .`

Информационный, не блокирующий (см. 4.2).

### Шаг 4. Topology A — файлы

#### 4.1. `CLAUDE.md`

- **Стек:** TanStack Start 1.168, React 19, Vite 8.0.16, Tailwind 4, Bun **1.3.3**, Nitro preset `node-server`.
- **Git-правила:** запрет `rebase`, `push --force`, `commit --amend`, `merge --squash` над запушенной историей. Синхронизация с `main` — только `git merge origin/main`. Ссылка на `AGENTS.md` и его маркеры `<!-- LOVABLE:BEGIN --> … <!-- LOVABLE:END -->`.
- **Топология:** Lovable пушит прямо в `main` (никаких «Lovable-веток»). Claude Code — ветки `claude/<feature>` и PR в `main`. `main` **не защищаем**.
- **Первичная настройка клона (один раз):**
  ```
  git config merge.ours.driver true
  ```
  На CI и у Lovable драйвер не объявлен — там `.gitattributes merge=ours` no-op, поэтому после мерджа с `main` обязательна регенерация `routeTree.gen.ts` через `bun run build:dev` отдельным коммитом.
- **Локальные проверки перед пушем:** `bun run lint`, `bunx tsc --noEmit`, `bunx prettier --check .`, `bun run build`. (`tsc`, **не `tsgo`** — tsgo в devDependencies нет, ставить = трогать `bun.lock` без причины.)
- **Зоны ответственности:**
  - **Lovable:** `src/routes/*` — **только JSX/разметка/стили внутри маршрута**, `src/components/**`, `src/styles.css`, `src/assets/**`, `src/data/mock.ts` (пока жив), `vite.config.ts`.
  - **Claude Code:** `src/lib/**` (в т.ч. будущие `src/lib/api.ts` и `src/lib/types/**`), **`loader` и `head()` внутри route-файлов — отдельным коммитом с префиксом `chore(loader):`** (head() читает loaderData, разрывать их по владельцам вредно), `public/robots.txt`, `public/sitemap.xml`, `.github/workflows/**`, `CLAUDE.md`, `.gitattributes`, deploy-артефакты.
- **TODO по `src/data/mock.ts` (владелец — Lovable, выполнить когда Claude Code начнёт `src/lib/api.ts`):**
  1. Вынести типы `NewsItem`, `NewsCategory`, `NewsAttachment`, `NewsAttachment["kind"]`, `NavSection`, `NavChild` из `src/data/mock.ts` в `src/lib/types/news.ts` и `src/lib/types/nav.ts`.
  2. Обновить все импорты `@/data/mock` в компонентах на новые пути типов.
  3. Только после этого Claude Code пишет `src/lib/api.ts`, использующий эти типы, и подключает его через `loader` в route-файлах (`chore(loader):`).
  4. Fallback на моки при недоступном API не делаем — при ошибке error state / пустой список / сообщение об ошибке.
- **Не трогать руками:** `src/routeTree.gen.ts`, `.lovable/`, `.workspace/skills/`, `AGENTS.md` (только вне маркеров), `src/routes/README.md`, `src/lib/lovable-error-reporting.ts`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `bun.lock` (только через `bun install`/`bun add`), `vite.config.ts` (плагины не добавляем, nitro preset — только по согласованию).
- **PR:** один PR — одна зона. Префиксы: `feat:`, `fix:`, `chore(loader):`, `chore(deploy):`, `chore(ci):`.

#### 4.2. `.github/workflows/ci.yml` — информационный, не блокирующий

Блокирующим CI становится только через branch protection / required status checks. `main` не защищаем — прямые пуши Lovable упрутся в защиту.

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
        with:
          bun-version: 1.3.3
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bunx prettier --check .
      - run: bunx tsc --noEmit
      - run: bun run build
```

Bun зафиксирован по локальной версии (`bun --version` → `1.3.3`), чтобы `--frozen-lockfile` не сломался о плавающий формат `bun.lock`.

#### 4.3. `.gitattributes`

```
src/routeTree.gen.ts merge=ours linguist-generated=true
bun.lock linguist-generated=true
```

- `bun.lock` — только `linguist-generated=true`, без `merge=ours` (для lock-файла опасно: молча оставит свою версию и разойдётся с `package.json` → `--frozen-lockfile` упадёт; конфликты решаются регенерацией через `bun install`).
- `routeTree.gen.ts` — `merge=ours` + `linguist-generated=true`.

### Порядок применения

1. Правка `.prettierignore` (шаг 0) — коммит `chore: extend .prettierignore`.
2. `bunx prettier --write .` (шаг 1) — коммит `style: apply prettier formatting`, только форматирование.
3. `bunx prettier --check .` + `echo $?` (шаг 2) — привожу вывод и exit-код.
4. Создание `CLAUDE.md`, `.github/workflows/ci.yml`, `.gitattributes` — коммит `chore(ci): add CLAUDE.md, CI workflow, .gitattributes`.
5. Прогон `bun run lint`, `bunx tsc --noEmit`, `bunx prettier --check .`, `bun run build` — привожу фактический вывод. Если красное — не «чиню молча».
