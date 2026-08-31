# CLAUDE.md — правила для Claude Code в этом репозитории

Репозиторий синхронизируется с Lovable. Соседний файл — `AGENTS.md` (полностью обёрнут маркерами `<!-- LOVABLE:BEGIN --> … <!-- LOVABLE:END -->`, редактируется только снаружи маркеров).

## Стек

- TanStack Start 1.168 (`@tanstack/react-start`, `@tanstack/react-router` 1.170)
- React 19
- Vite **8.0.16**
- Tailwind 4
- Bun **1.3.14** (единственный менеджер пакетов; единственный lock — `bun.lock`)
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

**Исключение (согласовано 07.08.2026, этап 5, обложка новости):**
`src/components/site/NewsGallery.tsx` и JSX страницы новости
(`src/routes/news.$newsId.tsx`) получают обложку и галерею раздельно из
`loader` — пропсы `cover?: string` и `gallery: string[]` (было: один плоский
список `images`, первый элемент которого рисовался как обложка). Источник —
`item.cover`/`item.gallery` из `src/server/news.ts`, где обложка теперь
определяется по `cover_photo_id`, а не по позиции в списке. Плоский список
`images = item.gallery?.length ? item.gallery : [item.cover]` — не
восстанавливать: это и был баг (обложка задваивалась миниатюрой). Дальше
`NewsGallery.tsx` и JSX этого route — не Lovable-зона без повторного
согласования.

**Исключение (согласовано 08.08.2026, защита от нехватки featured):**
`src/components/site/FeaturedNewsSection.tsx` — десктопная раскладка
hero/second/third обёрнута условным рендером по наличию элемента
(`items[0..2]` могут быть `undefined`, если featured-новостей меньше трёх —
блок теперь показывает ровно столько карточек, сколько отмечено, без
добора чем-либо ещё). Вёрстка/классы не менялись, добавлены только условия
рендера и guard от `NaN` в автопрокрутке при пустом массиве. Дальше этот
файл — по-прежнему не Lovable-зона без повторного согласования сверх этого
точечного изменения.

**Исключение (согласовано 09.08.2026, этап 6, документы на странице
новости):** JSX `src/routes/news.$newsId.tsx`, блок «Прикреплённые файлы» —
у одного `<a>` заменён атрибут `href="#"` на `href={att.url ?? "#"}` и
добавлены `target="_blank" rel="noreferrer"`. `att.url` — реальная ссылка на
файл, которую теперь формирует `src/server/news.ts` через
`getPublishedDocumentsForNews` (`src/server/documents.ts`), вместо всегда
пустой заглушки. Остальная разметка блока (иконки, бейдж `kind`, `title`,
`size`) не менялась — все три поля уже отрисовывались в вёрстке, не хватало
только рабочей ссылки. `url` в `NewsAttachment` (`src/lib/types/news.ts`) —
опциональный: у мок-фикстур `src/data/news-archive.ts` (Lovable-превью без
БД) его нет и не будет, `href` в этом случае остаётся заглушкой `"#"`, как и
раньше. Дальше `src/routes/news.$newsId.tsx` — по-прежнему не Lovable-зона
без повторного согласования сверх этого точечного изменения.

**Исключение (согласовано 10.08.2026, этап 6, разгрузка `src/assets/news`):**
`src/data/news-archive.ts` нигде выше в этом списке поимённо не назван (в
отличие от `mock.ts`), но `git log --format=%an` по нему даёт 100%
`gpt-engineer-app[bot]` с момента создания файла — ни одного коммита от
Claude Code, и сам этот документ называет его «мок-фикстур... (Lovable-превью
без БД)» абзацем выше. Это Lovable-файл на практике. В нём (и только в нём —
единственный импортёр `src/assets/news/**` во всём репозитории) разрешена
точечная правка Claude Code: удаление и правка импортов картинок из
`src/assets/news/**`, а также полей `cover` и `gallery` у существующих
элементов массива `archiveNews` — включая удаление самого файла-картинки из
`src/assets/news/**`, если на него после правки больше никто не ссылается.
Запрещено: `title`, `excerpt`, `body`, `date`, `category`, а также
добавление или удаление элементов массива `archiveNews` (без фиксации
конкретного числа — Lovable может пополнить превью новостями, и
зафиксированное здесь число со временем разойдётся с фактом). Причина
исключения: превью Lovable должно меняться по картинкам (сокращение объёма
сборки, устранение задвоения обложки в `gallery` — на пути с БД его нет,
`src/server/news.ts` фильтрует `photos` по `cover_photo_id`), но не по
содержанию новостей. Дальше `src/data/news-archive.ts` — по-прежнему не
Claude-Code-зона без повторного согласования сверх этого точечного
изменения.

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

**Уточнение (этап 5, PR фото, проверено сборкой).** Это ограничение не
действует для роутов, у которых есть только `server.handlers` и нет
`component`/`loader` (`src/routes/sitemap[.]xml.ts`, `src/routes/api/admin/upload.ts`)
— такие файлы никогда не попадают в клиентский бандл целиком, router-plugin
режет их на серверный чанк раньше import-protection. Проверено: пробный
роут с прямым импортом `src/server/storage.ts` внутри `server.handlers.GET`
собрался чисто (`bun run build:dev`, exit 0), а `grep` по `.output/public`
на признаки серверного кода (`aws-sdk`, имена функций) не дал совпадений.
`src/routes/api/admin/upload.ts` импортирует `src/server/auth.ts` и
`src/server/news-admin.ts` напрямую — обёртка `createServerFn` тут не
нужна и не нужна каждый раз, когда роут — чистый `server.handlers` без
`component`. Правило абзацем выше остаётся в силе для роутов с
`component`/`loader` (`index.tsx`, `news.$id.tsx` и т.п.) — там прямой
импорт `src/server` по-прежнему падает на сборке.

## Локальная разработка, боевая база и S3

Разработка и тесты идут против **локальной** базы PostgreSQL на машине
разработчика. `DATABASE_URL` в `.env` указывает на неё
(`postgresql://postgres:…@localhost:5432/ftspb_local`), боевая строка живёт
отдельно в `PROD_DATABASE_URL`. Приложение и все скрипты из `scripts/` читают
только `DATABASE_URL`.

TLS выбирается по хосту — `src/db/ssl.ts`, единственное место в репозитории,
где это решается: `localhost`/`127.0.0.1` — без шифрования (локальный кластер
его не умеет), любой другой хост — `verify-full` с вшитым в код CA Timeweb
(`src/db/ca.ts`). Отдельного флага окружения нет и заводить его не нужно.
Результат `sslFor()` обязан присваиваться ключу `ssl` **всегда**, без условных
спредов: пока ключ физически присутствует в объекте опций, он перекрывает
`?sslmode=` в URL; стоит его пропустить — управление вернётся строке
подключения.

Требование не стилистическое. Проверено подключением 31.08.2026: боевой
кластер Timeweb **принимает незашифрованные соединения** — с `ssl: false` тот
же сервер отдаёт `pg_stat_ssl.ssl = false` вместо отказа. Шифрование трафика
до прода держится исключительно на клиенте: если ключ `ssl` пропадёт из опций,
TLS не восстановит ни сервер, ни ошибка — соединение просто станет открытым,
молча.

### Боевая база

- Обращение к боевой базе допустимо **только на чтение и только** через
  `bun run db:refresh` — это `pg_dump` по `PROD_DATABASE_URL`. Других
  подключений к боевому кластеру ни агент, ни скрипты не открывают.
- `db:refresh` по построению не может развернуть дамп в удалённую базу: если
  `DATABASE_URL` указывает не на `localhost`/`127.0.0.1` — отказ с кодом
  выхода 1 до любых действий.
- Любая операция **записи** в боевую базу выполняется человеком вручную, с
  явной подстановкой боевой строки подключения в командной строке. Агент
  боевую строку в `DATABASE_URL` не подставляет.

### S3 не изолирован

Локальная среда изолирует **только базу данных**. Переменные `S3_*` указывают
на **боевой** бакет `ftspb-media` — локального аналога нет. Следствия:

- Загрузка файлов при локальной работе (админка,
  `scripts/migrate-archive.ts`, `scripts/check-content-disposition.ts`)
  создаёт **реальные объекты в боевом бакете**.
- Любые операции **физического удаления** объектов S3 при локальной работе
  **запрещены** — в частности `scripts/dedupe-cover.ts` без `--dry-run`.
  Локальная база и содержимое бакета живут независимо: удаление объекта по
  локальной копии данных сломает боевой сайт.

### Локальная среда не эквивалентна боевой побайтово

Локальная база создана с `datcollate = Russian_Russia.1251` (Windows), боевая
работает на Linux с другой локалью. Порядок сортировки текста в `ORDER BY` по
текстовым колонкам локально и на проде может различаться. Поведение,
зависящее от сортировки строк, локальным тестом не подтверждается.

### Язык PR

Заголовок и описание pull request — на русском языке.

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

`.github/workflows/ci.yml` — **информационный, не блокирующий**. Запускается на `push` в `main` и на все `pull_request`. Прогоняет `lint`, `prettier --check`, `tsc --noEmit`, `build`, `bun test` (job `test`).

Блокирующим CI становится только через branch protection / required status checks, которые здесь не включаем (см. «Топология Git»).

Версия bun в CI зафиксирована (`1.3.14`) — плавающий `bun-version: latest` однажды разойдётся с форматом `bun.lock` и уронит `--frozen-lockfile`.

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
- **Claude Code**: `/admin`, `src/server/**`, `src/db/**`, `drizzle/**`, `scripts/**`, `tests/**`, `src/start.ts`.
- **Lovable не изменяет**: `src/routes/admin/**`, `src/server/**`, `src/db/**`, `drizzle/**`, `scripts/**`, `src/data/**`, `tests/**`, `src/start.ts`.
- `src/start.ts` — серверный жизненный цикл запроса TanStack Start (`requestMiddleware`): здесь `errorMiddleware` (перехват необработанных ошибок, страница 500) и мидлварь 308-редиректа с `www.` на канонический домен. Файл создан шаблоном Lovable, но с этого момента — зона Claude Code; Lovable его не трогает. Ограничение редиректа: раздача статики из `.output/public` в Nitro-preset `node-server` обслуживается внутренним обработчиком Nitro раньше `requestMiddleware`, поэтому прямой запрос к уже существующему файлу в `.output/public` по адресу с `www` редиректа не получит (HTML-страница редиректится раньше, чем браузер запросит статику — на практике не проявляется).
- Серверные npm-зависимости зоны Claude Code (не удалять и не менять версии без согласования): drizzle-orm, drizzle-kit, postgres, bcryptjs, @aws-sdk/client-s3, sanitize-html. Раздел `scripts` в `package.json` и каталог `tests/**` — тоже зона Claude Code. Пакеты `@lovable.dev/*` — зона Lovable, не пиннить.
- Синхронизация — только через merge, без rebase и force-push.
- Guard в `src/routes/admin/_authed/route.tsx` — навигационный, не граница безопасности. Каждая серверная функция админки обязана проверять сессию самостоятельно: эндпоинты `createServerFn` вызываются по HTTP напрямую.
- `gh` допустим только для `gh pr create`, `gh pr view`, `gh pr status`; мердж PR делает человек вручную через веб-интерфейс.
- Секреты (`DATABASE_URL`, ключи S3, `SESSION_SECRET`) в удалённую сессию агента не передаются; любая работа, требующая живой БД или S3, выполняется только в локальной сессии на машине Антона.
