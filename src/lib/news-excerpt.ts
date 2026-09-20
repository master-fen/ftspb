/**
 * Правило анонса новости: один источник текста (свой анонс, иначе начало
 * тела) и одна обрезка по границе предложения с двумя порогами — карточка
 * (`CARD_EXCERPT_MAX`) и описание страницы (`PAGE_DESCRIPTION_MAX`).
 *
 * Модуль зовут только серверные функции (`src/server/news.ts`): границу
 * предложения ищет регулярка с lookbehind, в клиентский чанк она не уходит.
 */

/** Порог анонса карточки (знаков). */
export const CARD_EXCERPT_MAX = 150;
/** Порог описания страницы новости — description, og:description, twitter:description (знаков). */
export const PAGE_DESCRIPTION_MAX = 200;

/**
 * Граница предложения: знак конца (. ! ? …) с возможными закрывающими
 * кавычками/скобками, затем пробел. Сокращения («г.», «ул.») рвут
 * предложение — это свойство самого правила, то же, что в примерке порогов
 * при инвентаризации архива (scripts/parse-archive.ts, `excerptFromBody`).
 */
const SENTENCE_SPLIT_RE = /(?<=[.!?…][»”"')\]]*)\s+/u;

/** Тот же признак HTML, что у NewsBody: есть хотя бы один тег. */
const HAS_TAG_RE = /<\/?[a-z][^>]*>/i;
const TABLE_RE = /<table\b[\s\S]*?<\/table>/gi;
const PARAGRAPH_RE = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
const BR_RE = /<br\s*\/?>/gi;
const TAG_RE = /<[^>]*>/g;

/** Сущности, которые оставляет sanitize-html (`& < > "`), плюс апостроф, неразрывный пробел и числовые. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#")) {
      const point = lower.startsWith("#x")
        ? parseInt(lower.slice(2), 16)
        : parseInt(lower.slice(1), 10);
      return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    }
    return NAMED_ENTITIES[lower] ?? whole;
  });
}

/** Пробелы (включая неразрывный и переводы строк) — в один, края обрезаны. */
const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * Текст тела для правила анонса. Обычный текст (без тегов) берётся целиком.
 * В HTML сначала вырезаются таблицы целиком — иначе у списков сборной в
 * анонс попадала бы строка заголовков таблицы; затем берётся текст всех
 * абзацев `<p>` (первый бывает пустым, `<p>&nbsp;</p>`), а если абзацев нет
 * вовсе — текст остатка без тегов.
 */
export function paragraphText(body: string | null | undefined): string {
  if (!body) return "";
  if (!HAS_TAG_RE.test(body)) return collapse(decodeEntities(body));
  const withoutTables = body.replace(TABLE_RE, " ");
  const paragraphs = [...withoutTables.matchAll(PARAGRAPH_RE)].map((m) => m[1]);
  const source = paragraphs.length > 0 ? paragraphs.join(" ") : withoutTables;
  return collapse(decodeEntities(source.replace(BR_RE, " ").replace(TAG_RE, " ")));
}

/**
 * Обрезка до `max` знаков по границе предложения: предложения набираются,
 * пока помещаются целиком. Если не поместилось даже первое — обрезка по
 * последнему пробелу с многоточием; хвостовые знаки препинания перед «…»
 * срезаются. Итог не длиннее `max`; слова не рвутся (кроме единственного
 * слова длиннее порога — его рвать больше негде).
 */
export function truncateAtSentence(text: string, max: number): string {
  const flat = collapse(text);
  if (flat.length <= max) return flat;
  let out = "";
  for (const sentence of flat.split(SENTENCE_SPLIT_RE)) {
    const candidate = out ? `${out} ${sentence}` : sentence;
    if (candidate.length > max) break;
    out = candidate;
  }
  if (out !== "") return out;
  const head = flat.slice(0, max - 1);
  const cut = head.lastIndexOf(" ");
  const words = (cut > 0 ? head.slice(0, cut) : head).replace(/[\s,;:—–-]+$/u, "");
  return `${words}…`;
}

/** Источник анонса: свой анонс, если он заполнен, иначе абзацы тела. */
export function excerptSource(
  excerpt: string | null | undefined,
  body: string | null | undefined,
): string {
  const own = excerpt ? collapse(excerpt) : "";
  return own !== "" ? own : paragraphText(body);
}

/** Анонс карточки: источник, обрезанный до `CARD_EXCERPT_MAX`. Пустая строка — карточка без текста. */
export function cardExcerpt(
  excerpt: string | null | undefined,
  body: string | null | undefined,
): string {
  return truncateAtSentence(excerptSource(excerpt, body), CARD_EXCERPT_MAX);
}

/** Описание страницы новости: тот же источник, порог `PAGE_DESCRIPTION_MAX`. */
export function pageDescription(
  excerpt: string | null | undefined,
  body: string | null | undefined,
): string {
  return truncateAtSentence(excerptSource(excerpt, body), PAGE_DESCRIPTION_MAX);
}
