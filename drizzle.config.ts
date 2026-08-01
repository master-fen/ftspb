import process from "node:process";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // `db:generate` не требует живого подключения, диффует схему с
  // локальными снапшотами. DATABASE_URL нужен только для migrate/studio.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
