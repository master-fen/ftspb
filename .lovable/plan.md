# Починить окно превью (403 «Blocked request»)

## Что происходит

Приложение работает: локальный дев-сервер отвечает `200` и отдаёт корректный HTML,
в одном из открытых окон превью (домен `*.lovableproject.com`) страница отрисована
нормально.

Но запрос с хостом окна превью блокируется дев-сервером Vite:

```text
curl -H "Host: id-preview--<project-id>.lovable.app" http://localhost:8080/
→ 403 Forbidden
  Blocked request. This host ("id-preview--<project-id>.lovable.app") is not allowed.
  To allow this host, add it to `server.allowedHosts` in vite.config.js.
```

Это встроенная защита Vite от DNS-rebinding: она пропускает только localhost и
IP-адреса, если список разрешённых хостов не задан явно. В `vite.config.ts`
`server.allowedHosts` нет, и `@lovable.dev/vite-tanstack-config` его тоже не
проставляет — поэтому окно превью на домене `lovable.app` получает 403, а
задеплоенный сайт (там нет дев-сервера Vite) работает как обычно.

Правки через Claude Code тут не при чём — это конфигурация дев-сервера.

## Что сделать

1. В `vite.config.ts` добавить разрешённые хосты превью Lovable — только это,
   без новых плагинов и без изменения `nitro.preset`:

   ```ts
   export default defineConfig({
     nitro: { preset: "node-server" },
     vite: {
       server: {
         allowedHosts: [".lovable.app", ".lovableproject.com", ".lovable.dev"],
       },
     },
   });
   ```

   Опция прокидывается через `options.vite` и в sandbox-режиме не вырезается
   (обрезаются только `headers`, `cors`, `proxy`).

2. Перезапустить дев-сервер и проверить, что запрос с хостом превью отдаёт `200`,
   а не `403`.

3. Проверить оба окна превью (`lovable.app` и `lovableproject.com`) на живой
   отрисовке главной страницы и страницы новости, плюс отсутствие ошибок в консоли.

## Технические детали

- Файл затрагивается один: `vite.config.ts` (зона Lovable).
- Зоны Claude Code (`src/server/**`, `src/db/**`, `drizzle/**`, `scripts/**`,
  `src/data/**`, `src/start.ts`, раздел `scripts` в `package.json`) не трогаем.
- Предупреждение Vite про `vite-tsconfig-paths` — безобидное, к поломке превью
  отношения не имеет; в рамках этой задачи не меняем.
