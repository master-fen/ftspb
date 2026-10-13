/**
 * Конфиг сборки. До 13.10.2026 его собирал пакет `@lovable.dev/vite-tanstack-config`;
 * здесь — то, что он давал вне песочницы Lovable, явно и в том же порядке
 * плагинов: production-сборка вышла побайтно той же (docs/decisions.md,
 * «Сборка клиента»). Служебное для редактора Lovable (devtools с разметкой
 * исходников, логгеры ошибок в его окно, прокси ассетов, HMR-gate, задержка
 * watch) не перенесено.
 *
 * Новый плагин или смена параметров — по согласованию: от этого файла зависит
 * вся сборка, и стоп-проверка — сравнение `.output` до и после.
 */
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode }) => ({
  // `bun run build:dev` (регенерация routeTree.gen.ts) — клиент в режиме разработки.
  ...(command === "build" && mode === "development"
    ? {
        environments: {
          client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
        },
        esbuild: { keepNames: true },
      }
    : {}),
  css: { transformer: "lightningcss" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    ignoreOutdatedRequests: true,
  },
  server: { host: "::", port: 8080 },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // Импорт из каталогов `server` в клиентском окружении — ошибка сборки
    // (CLAUDE.md, «Импорт содержимого src/server из route-файлов»).
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // Обычный Node.js-сервер: `node .output/server/index.mjs` слушает process.env.PORT.
    command === "build" && nitro({ preset: "node-server" }),
    viteReact(),
  ],
}));
