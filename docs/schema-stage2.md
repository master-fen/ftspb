# Этап 2. Схема данных и подключение к БД

> Дельта к базе знаний ФТ СПб, раздел 5. После приёмки влить в базу знаний как замороженную модель.

## Что уже есть

- PostgreSQL 17, Timeweb, Москва. **Одна база `default_db`, один пользователь `gen_user`** — ограничение минимального тарифа.
- S3-бакет `ftspb-media`, публичный, endpoint `https://s3.twcstorage.ru`, регион `ru-1`.
- Переменные в приложении: `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_KEY_ID`, `S3_SECRET`, `SESSION_SECRET`.
- Подключение только по TLS, строка заканчивается на `?sslmode=verify-full`, нужен CA-сертификат.

## Разделение боевых и черновых данных

Двух баз нет, поэтому изоляция через схемы PostgreSQL:

- `public` — боевые данные, их читает сайт.
- `dev` — черновые, для локальных экспериментов.

Схема выбирается переменной `DB_SCHEMA` (по умолчанию `public`). В `.env` на машине Антона — `DB_SCHEMA=dev`.

Честное ограничение: изоляция слабее, чем у разных баз. Ошибка в переменной означает правку боевых данных. Пока в базе только новости, цена ошибки невелика; при росте проекта — отдельный кластер.

---

## Замороженная модель

Замораживается вся модель. Таблицы создаются по мере надобности: на этом этапе — только News и служебные.

### Принципы

- Идентификатор — `uuid`, генерируется базой.
- Публичный адрес новости — `slug`, уникальный. Существующие ссылки `/news/$newsId` не ломаются.
- Даты — `date` или `timestamptz`, всегда ISO. Формат `dd.mm.yy` в базе не живёт.
- Удаление мягкое: `deleted_at timestamptz NULL`.
- `created_at` / `updated_at` у всех content-таблиц.

### news

| Поле                               | Тип                            | Примечание                                  |
| ---------------------------------- | ------------------------------ | ------------------------------------------- |
| id                                 | uuid PK                        |                                             |
| slug                               | text UNIQUE NOT NULL           | публичный идентификатор                     |
| title                              | text NOT NULL                  |                                             |
| excerpt                            | text NULL                      | анонс                                       |
| body                               | text NULL                      | HTML, ограниченный набор тегов              |
| section                            | section_enum NULL              | **NULL = обычная новость**                  |
| published_at                       | date NOT NULL                  |                                             |
| status                             | status_enum NOT NULL           | `draft` / `published`, по умолчанию `draft` |
| featured                           | boolean NOT NULL DEFAULT false |                                             |
| featured_order                     | integer NULL                   |                                             |
| source                             | text NULL                      | подпись источника из архива                 |
| cover_photo_id                     | uuid NULL FK → news_photo      | обложка                                     |
| created_at, updated_at, deleted_at | timestamptz                    |                                             |

**Enum `section_enum`: `federation` | `referees`.** Значения «Общее» нет — это NULL. Решение Антона 01.08.2026.

Индексы: `slug`, `(status, published_at DESC)`, `section`.

### news_photo

| Поле          | Тип                                       |
| ------------- | ----------------------------------------- |
| id            | uuid PK                                   |
| news_id       | uuid NOT NULL FK → news ON DELETE CASCADE |
| s3_key        | text NOT NULL                             |
| alt           | text NULL                                 |
| position      | integer NOT NULL                          |
| width, height | integer NULL                              |
| created_at    | timestamptz                               |

Хранится **ключ объекта**, не полный URL. Полный собирается на фронте из `S3_ENDPOINT` + `S3_BUCKET`. Это позволяет сменить хранилище или подключить домен без миграции данных.

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

Связь M2M: `news_id`, `document_id`, `position`. PK составной.

### admin_user

`id`, `login` UNIQUE, `password_hash`, `display_name`, `is_active`, `created_at`, `last_login_at`.

Публичной регистрации нет. Учётки заводит скрипт.

### admin_session

`id` (случайный токен), `user_id` FK, `expires_at`, `created_at`, `user_agent`, `ip`.

### Сущности вне этого этапа

Event, Tournament, NationalTeam, Player, Club, Заявка, ContactPage, SiteSettings — модель в разделе 5 базы знаний, таблицы создаются в следующих итерациях. `section_enum` у них тот же.

---

## Задание для Claude Code

Ветка `claude/db-schema`, merge-only PR.

**Зоны:** только `src/db/**`, `drizzle/**`, `scripts/**`, `docs/**`, `package.json`, `.env.example`. Публичные страницы и `src/data/**` не трогать — сайт после этого этапа работает как раньше, на фикстуре.

1. Установить `drizzle-orm`, `drizzle-kit`, `postgres`.

2. `src/db/schema.ts` — таблицы `news`, `news_photo`, `document`, `news_document`, `admin_user`, `admin_session` и enum'ы по таблицам выше. Схема из `process.env.DB_SCHEMA ?? "public"`.

3. `src/db/client.ts` — подключение через `postgres.js`. TLS обязателен. Пул небольшой (`max: 5`) — на проде 2 ГБ RAM. Если `DATABASE_URL` не задан, экспортировать `null`, не падать: это штатный режим превью Lovable.

4. `drizzle.config.ts` + миграция `0001_news`. Миграции файлами в репозитории, не `db:push`.

5. Скрипты в `package.json`: `db:generate`, `db:migrate`, `db:studio`.

6. `.env.example` со всеми именами переменных и пустыми значениями. **Реальный `.env` в `.gitignore`** — проверить.

7. `docs/schema.md` — таблицы выше плюс раздел про `public`/`dev`.

8. Проверить, что `bun run build`, `lint`, `typecheck` проходят и CI зелёный.

**Не делать:** миграцию архива, страницы `/admin`, изменение чтения новостей на сайте. Это следующие этапы.

## Критерий завершения

- `bun run db:migrate` создаёт таблицы в схеме `dev` базы `default_db`.
- Подключение с машины Антона проходит (нужен CA-сертификат Timeweb, вкладка «Подключение» → выбрать Windows).
- Сайт и превью Lovable работают как раньше.
- CI зелёный, PR влит.

## Риск этапа

Внешний доступ к базе с домашней машины не проверялся ни разу. Если он закрыт или мешает TLS-сертификат — выяснится здесь. Это ожидаемая точка отказа, не повод менять план: в худшем случае миграции запускаются из консоли приложения в панели Timeweb.
