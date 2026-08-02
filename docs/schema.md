# Схема данных

Источник: `docs/schema-stage2.md` (этап 2, задание для Claude Code). Здесь —
итог: замороженная модель данных, как она реализована в `src/db/schema.ts`.

## Инфраструктура

- PostgreSQL 17, Timeweb, Москва. Одна база `default_db`, один пользователь
  `gen_user` — ограничение минимального тарифа.
- S3-бакет `ftspb-media`, публичный, endpoint `https://s3.twcstorage.ru`,
  регион `ru-1`.
- Подключение только по TLS: `DATABASE_URL` заканчивается на
  `?sslmode=verify-full`, нужен CA-сертификат Timeweb (вкладка
  «Подключение» в панели → выбрать Windows).
- Переменные окружения — см. `.env.example`.

## Схемы `public` / `dev`

Отдельной базы для черновых данных нет, поэтому изоляция — через схемы
Postgres внутри `default_db`:

- `public` — боевые данные, их читает сайт.
- `dev` — черновые, для локальных экспериментов.

Схема выбирается переменной `DB_SCHEMA` (по умолчанию `public`).
`src/db/schema.ts` строит таблицы либо через `pgTable`/`pgEnum` (для
`public` — drizzle-orm не разрешает объявлять `public` через `pgSchema`,
так как это схема по умолчанию), либо через `pgSchema(DB_SCHEMA).table` /
`.enum` для любого другого имени.

Честное ограничение: изоляция схемами слабее, чем изоляция разными базами.
Ошибка в `DB_SCHEMA` означает правку боевых данных. Пока в базе только
новости, цена ошибки невелика; при росте проекта — отдельный кластер.

## Принципы модели

- Идентификатор — `uuid`, генерируется базой (`gen_random_uuid()`).
- Публичный адрес новости — `slug`, уникальный. Существующие ссылки
  `/news/$newsId` не ломаются.
- Даты — `date` или `timestamptz`, всегда ISO. Формат `dd.mm.yy` в базе не
  живёт.
- Удаление мягкое: `deleted_at timestamptz NULL` — там, где это указано в
  таблице ниже.
- `created_at` / `updated_at` — у content-таблиц, где это указано ниже.

## Таблицы

### news

| Поле                               | Тип                                           | Примечание                                  |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------- |
| id                                 | uuid PK                                       |                                             |
| slug                               | text UNIQUE NOT NULL                          | публичный идентификатор                     |
| title                              | text NOT NULL                                 |                                             |
| excerpt                            | text NULL                                     | анонс                                       |
| body                               | text NULL                                     | HTML, ограниченный набор тегов              |
| section                            | section_enum NULL                             | **NULL = обычная новость**                  |
| published_at                       | date NOT NULL                                 |                                             |
| status                             | status_enum NOT NULL                          | `draft` / `published`, по умолчанию `draft` |
| featured                           | boolean NOT NULL DEFAULT false                |                                             |
| featured_order                     | integer NULL                                  |                                             |
| source                             | text NULL                                     | подпись источника из архива                 |
| cover_photo_id                     | uuid NULL FK → news_photo, ON DELETE SET NULL | обложка                                     |
| created_at, updated_at, deleted_at | timestamptz                                   |                                             |

Enum `section_enum`: `federation` | `referees`. Значения «Общее» нет — это
NULL (решение Антона, 01.08.2026).

Индексы: уникальный индекс на `slug` (из UNIQUE-ограничения),
`(status, published_at DESC)`, `section`.

### news_photo

| Поле          | Тип                                        |
| ------------- | ------------------------------------------ |
| id            | uuid PK                                    |
| news_id       | uuid NOT NULL FK → news, ON DELETE CASCADE |
| s3_key        | text NOT NULL                              |
| alt           | text NULL                                  |
| position      | integer NOT NULL                           |
| width, height | integer NULL                               |
| created_at    | timestamptz                                |

Хранится **ключ объекта**, не полный URL. Полный собирается на фронте из
`S3_ENDPOINT` + `S3_BUCKET`. Это позволяет сменить хранилище или подключить
домен без миграции данных.

### document

| Поле                               | Тип               |
| ---------------------------------- | ----------------- |
| id                                 | uuid PK           |
| title                              | text NOT NULL     |
| s3_key                             | text NOT NULL     |
| mime_type                          | text NOT NULL     |
| size_bytes                         | bigint NOT NULL   |
| section                            | section_enum NULL |
| document_date                      | date NOT NULL     |
| created_at, updated_at, deleted_at | timestamptz       |

`document_date` редактируемая, по умолчанию — момент создания.

### news_document

Связь M2M: `news_id`, `document_id`, `position`. Составной PK
`(news_id, document_id)`. При удалении `news` или `document` строки связи
удаляются каскадно.

### admin_user

`id`, `login` UNIQUE, `password_hash`, `display_name`, `is_active`,
`created_at`, `last_login_at`.

Публичной регистрации нет. Учётки заводит скрипт.

### admin_session

`id` (случайный токен, генерируется приложением — не uuid базы), `user_id`
FK → admin_user (ON DELETE CASCADE), `expires_at`, `created_at`,
`user_agent`, `ip`.

### Вне этого этапа

Event, Tournament, NationalTeam, Player, Club, Заявка, ContactPage,
SiteSettings — модель в разделе 5 базы знаний, таблицы создаются в
следующих итерациях. `section_enum` у них тот же.

## Работа с миграциями

```bash
bun run db:generate   # сгенерировать SQL-миграцию из src/db/schema.ts
bun run db:migrate    # применить миграции к базе (нужен DATABASE_URL)
bun run db:studio     # drizzle-kit studio
```

Миграции — файлами в `drizzle/` (`drizzle/0000_news.sql` и далее), не
`db:push`. `db:generate` не требует подключения к базе — он диффует схему
с локальными снапшотами в `drizzle/meta/`. `db:migrate` и `db:studio`
требуют `DATABASE_URL`.

`src/db/client.ts` при отсутствующем `DATABASE_URL` экспортирует `db =
null` вместо падения — это штатный режим превью Lovable, где базы нет.

## Что не сделано на этом этапе

Миграция архива, страницы `/admin`, подключение чтения новостей на сайте к
базе — сайт продолжает работать на фикстуре `src/data/mock.ts`. Это
следующие этапы.
