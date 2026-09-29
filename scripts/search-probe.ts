/**
 * Проба публичного поиска — печатает то же, что увидит страница `/search`:
 * числа по вкладкам и находки текущей вкладки. Зовёт `runSearch`
 * (`src/server/search.ts`) — ту же функцию, что и RPC-обёртка маршрута, не
 * отдельную реализацию.
 *
 * Запуск:
 *   bun run search:probe -- "ЗАПРОС" [--tab=all|news|documents|events|sections] [--year=ГГГГ] [--sort=relevance|date] [--page=N]
 *
 * Отказывается работать, если `DATABASE_URL` ведёт не на localhost/127.0.0.1
 * — до подключения, код выхода 1 (как `reset-archive.ts`). Гвард — до
 * любого импорта, который мог бы создать подключение к БД: статические
 * импорты выше тянут только чистые модули `src/lib`, `runSearch` из
 * `src/server/search` подключается динамически, после проверки хоста.
 */
import process from "node:process";
import { isLocalHost } from "@/db/ssl";
import { parsePageParam } from "@/lib/news-paging";
import { fragmentToPlainMarked, type FragmentSpan } from "@/lib/search-fragment";
import {
  parseSearchQParam,
  parseSearchSortParam,
  parseSearchTabParam,
  parseSearchYearParam,
} from "@/lib/search-params";
import { SECTION_LABELS } from "@/lib/section-category";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !isLocalHost(databaseUrl)) {
  const hostname = databaseUrl ? new URL(databaseUrl).hostname : "не задан";
  console.error(`Отказ: DATABASE_URL указывает не на localhost (${hostname})`);
  process.exit(1);
}

function parseArgs(argv: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (match) {
      flags[match[1]] = match[2];
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

const { flags, positional } = parseArgs(process.argv.slice(2));
const input = {
  q: parseSearchQParam(positional[0]),
  tab: parseSearchTabParam(flags.tab),
  year: parseSearchYearParam(flags.year),
  sort: parseSearchSortParam(flags.sort),
  page: parsePageParam(flags.page),
};

console.log(
  `Запрос: «${input.q}»  вкладка=${input.tab}  год=${input.year}  сортировка=${input.sort}  страница=${input.page}`,
);

// Динамический импорт — гвард выше обязан отработать до подключения к БД.
const { runSearch } = await import("@/server/search");

const result = await runSearch(input);

if (result.tooVague) {
  console.log("Уточните запрос");
  process.exit(0);
}

console.log(
  `Числа по вкладкам: новости=${result.counts.news} документы=${result.counts.documents} события=${result.counts.events} разделы=${result.counts.sections}`,
);
if (result.years.length > 0) {
  console.log(`Годы: ${result.years.join(", ")}`);
}
console.log(
  `Найдено: ${result.totalForTab}, страниц: ${result.pageCount}, текущая: ${result.page}`,
);
if (result.partialMatch) {
  console.log("Точных совпадений нет — показаны результаты, где есть часть слов");
}

function marked(spans: readonly FragmentSpan[]): string {
  return fragmentToPlainMarked(spans);
}

if (result.sectionsTeaser?.length) {
  console.log("\nРазделы сайта (тизер):");
  for (const row of result.sectionsTeaser) {
    console.log(`  ${marked(row.title)} — ${row.breadcrumb.join(" → ")} — ${row.href}`);
    if (row.fragment.length) console.log(`    ${marked(row.fragment)}`);
  }
}
if (result.documentsTeaser?.length) {
  console.log("\nДокументы (тизер):");
  for (const row of result.documentsTeaser) {
    console.log(`  ${marked(row.title)} — ${row.dateFormatted} — ${row.href}`);
    if (row.parent)
      console.log(
        `    в ${row.parent.kind === "news" ? "новости" : "событии"} «${row.parent.title}», ${row.parent.dateFormatted}`,
      );
  }
}
if (result.eventsTeaser?.length) {
  console.log("\nСобытия (тизер):");
  for (const row of result.eventsTeaser) {
    console.log(`  ${row.dateFormatted} — ${marked(row.title)} — ${row.href}`);
    if (row.agendaFragment.length) console.log(`    ${marked(row.agendaFragment)}`);
  }
}

if (result.news?.length) {
  console.log(`\nНовости (страница ${result.page} из ${result.pageCount}):`);
  for (const row of result.news) {
    const section = row.section === null ? null : SECTION_LABELS[row.section];
    console.log(
      `  ${row.dateFormatted}${section ? ` · ${section}` : ""} — ${marked(row.title)} — ${row.href}`,
    );
    console.log(`    ${marked(row.fragment)}`);
  }
}
if (result.documents?.length) {
  console.log(`\nДокументы (страница ${result.page} из ${result.pageCount}):`);
  for (const row of result.documents) {
    console.log(`  ${marked(row.title)} — ${row.dateFormatted} — ${row.href}`);
    if (row.parent)
      console.log(
        `    в ${row.parent.kind === "news" ? "новости" : "событии"} «${row.parent.title}», ${row.parent.dateFormatted}`,
      );
  }
}
if (result.events?.length) {
  console.log(`\nСобытия (страница ${result.page} из ${result.pageCount}):`);
  for (const row of result.events) {
    console.log(
      `  ${row.dateFormatted} — ${marked(row.title)}${row.location ? ` — ${row.location}` : ""} — ${row.href}`,
    );
    if (row.agendaFragment.length) console.log(`    ${marked(row.agendaFragment)}`);
  }
}
if (result.sections?.length) {
  console.log(`\nРазделы сайта (страница ${result.page} из ${result.pageCount}):`);
  for (const row of result.sections) {
    console.log(`  ${marked(row.title)} — ${row.breadcrumb.join(" → ")} — ${row.href}`);
    if (row.fragment.length) console.log(`    ${marked(row.fragment)}`);
  }
}

process.exit(0);
