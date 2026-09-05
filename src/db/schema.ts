import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgEnum,
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
 * Имя схемы (`DB_SCHEMA`) нигде здесь не участвует: таблицы объявлены без
 * привязки к схеме (`pgTable`/`pgEnum`), выбор схемы — только через
 * `search_path` подключения (см. src/db/client.ts, drizzle.config.ts).
 * Это позволяет применять одну и ту же SQL-миграцию к любой схеме.
 */
export const sectionEnum = pgEnum("section_enum", ["federation", "referees"]);
export const statusEnum = pgEnum("status_enum", ["draft", "published"]);

export const news = pgTable(
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

export const newsPhoto = pgTable("news_photo", {
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

export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  s3Key: text("s3_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  section: sectionEnum("section"),
  documentDate: date("document_date").notNull(),
  fileName: text("file_name").notNull(),
  status: statusEnum("status").notNull().default("draft"),
  inLibrary: boolean("in_library").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const newsDocument = pgTable(
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

/**
 * Руководство Федерации — публичная страница /federation/leadership.
 * Схема не указывается: выбирается search_path (см. заголовок файла).
 */
export const federationPerson = pgTable(
  "federation_person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** ФИО. */
    fullName: text("full_name").notNull(),
    /** Должность. */
    role: text("role").notNull(),
    bio: text("bio"),
    phone: text("phone"),
    email: text("email"),
    /**
     * Ключ фото в S3. В ЭТОМ PR колонка не заполняется и не читается — ни
     * админкой, ни публичной страницей. Заведена заранее, чтобы загрузка фото
     * (отдельный PR) не требовала второй миграции.
     */
    photoS3Key: text("photo_s3_key"),
    /** Порядок вывода на странице: меньше — выше. */
    position: integer("position").notNull(),
    status: statusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("federation_person_status_position_idx").on(table.status, table.position)],
);

export const adminUser = pgTable("admin_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  login: text("login").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const adminSession = pgTable("admin_session", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => adminUser.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  userAgent: text("user_agent"),
  ip: text("ip"),
});
