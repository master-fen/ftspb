<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Не трогать руками

- `src/routeTree.gen.ts` — автогенерация TanStack Router.
- `.lovable/`, `.workspace/skills/` (последнее сбрасывается на каждое сообщение Lovable).
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
