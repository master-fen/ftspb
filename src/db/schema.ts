import process from "node:process";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * Одна база `default_db`, изоляция боевых/черновых данных — через схему
 * Postgres, а не через отдельную БД. См. docs/schema.md.
 *
 * drizzle-orm запрещает `pgSchema("public")` — это schema по умолчанию,
 * для неё нужно использовать голые `pgTable`/`pgEnum`. Поэтому схема
 * выбирается на рантайме: `dev` идёт через `pgSchema(...)`, `public` —
 * через обычные `pgTable`/`pgEnum`.
 */
const schemaName = process.env.DB_SCHEMA ?? "public";
const namedSchema = schemaName === "public" ? null : pgSchema(schemaName);

const table: typeof pgTable = namedSchema
  ? (namedSchema.table as unknown as typeof pgTable)
  : pgTable;
const dbEnum: typeof pgEnum = namedSchema
  ? (namedSchema.enum.bind(namedSchema) as unknown as typeof pgEnum)
  : pgEnum;

export const sectionEnum = dbEnum("section_enum", ["federation", "referees"]);
export const statusEnum = dbEnum("status_enum", ["draft", "published"]);

export const news = table(
  "news",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    body: text("body"),
    section: sectionEnum("section"),
    publishedAt: date("published_at").notNull(),
    status: statusEnum("status").notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    featuredOrder: integer("featured_order"),
    source: text("source"),
    coverPhotoId: uuid("cover_photo_id").references((): AnyPgColumn => newsPhoto.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("news_status_published_at_idx").on(table.status, table.publishedAt.desc()),
    index("news_section_idx").on(table.section),
  ],
);

export const newsPhoto = table("news_photo", {
  id: uuid("id").primaryKey().defaultRandom(),
  newsId: uuid("news_id")
    .notNull()
    .references(() => news.id, { onDelete: "cascade" }),
  s3Key: text("s3_key").notNull(),
  alt: text("alt"),
  position: integer("position").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const document = table("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  s3Key: text("s3_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  section: sectionEnum("section"),
  documentDate: date("document_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const newsDocument = table(
  "news_document",
  {
    newsId: uuid("news_id")
      .notNull()
      .references(() => news.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.newsId, table.documentId] })],
);

export const adminUser = table("admin_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  login: text("login").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const adminSession = table("admin_session", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => adminUser.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  userAgent: text("user_agent"),
  ip: text("ip"),
});
