/**
 * Построение части индекса поиска для новостей — опубликованные и
 * неудалённые, то же правило, что у ленты (`src/server/news.ts`). Заголовок
 * и анонс хранят позиции вхождений (нужны для подсветки на каждой находке),
 * тело — только множества слов (`bodyPresence`) плюс сам видимый текст
 * (`bodyText`): позиции для фрагмента пересчитываются по требованию только
 * для показанной страницы находок (`tokenizeWithStems(bodyText)` — дёшево,
 * это разбор уже готовой строки в памяти, не повторный запрос к БД), а не
 * хранятся для всех ~1990 новостей разом — иначе память индекса росла бы от
 * длины тел, а не от размера словаря (docs/decisions.md).
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import type { db as Db } from "@/db/client";
import { news } from "@/db/schema";
import {
  buildFieldPresence,
  buildFieldWithPositions,
  tokenizeWithStems,
  type FieldPresence,
  type FieldWithPositions,
} from "@/lib/search-field-index";
import { visibleText } from "@/lib/search-text";

export type NewsIndexItem = {
  id: string; // slug — используется и как адрес /news/{id}
  href: string;
  section: "federation" | "referees" | null;
  publishedAt: string; // ГГГГ-ММ-ДД
  createdAt: string; // ISO с зоной
  title: FieldWithPositions;
  excerpt: FieldWithPositions;
  bodyPresence: FieldPresence;
  bodyText: string;
};

export async function buildNewsIndex(
  database: NonNullable<typeof Db>,
  intern: (value: string) => string,
): Promise<NewsIndexItem[]> {
  const rows = await database
    .select({
      slug: news.slug,
      title: news.title,
      excerpt: news.excerpt,
      body: news.body,
      section: news.section,
      publishedAt: news.publishedAt,
      createdAt: news.createdAt,
    })
    .from(news)
    .where(and(eq(news.status, "published"), isNull(news.deletedAt)))
    .orderBy(desc(news.publishedAt), desc(news.createdAt), desc(news.id));

  return rows.map((row) => {
    const bodyText = visibleText(row.body);
    return {
      id: row.slug,
      href: `/news/${row.slug}`,
      section: row.section,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt.toISOString(),
      title: buildFieldWithPositions(visibleText(row.title), intern),
      excerpt: buildFieldWithPositions(visibleText(row.excerpt ?? ""), intern),
      // Позиции тела не хранятся — только множества (см. doc-comment модуля).
      bodyPresence: buildFieldPresence(tokenizeWithStems(bodyText, intern)),
      bodyText,
    };
  });
}
