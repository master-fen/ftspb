/**
 * Реестр «Разделы сайта» публичного поиска — первый общий реестр страниц в
 * репозитории (`src/routes/sitemap[.]xml.ts` перечисляет страницы отдельно,
 * своим массивом-литералом). Правило синхронизации — CLAUDE.md, рядом с
 * правилом карты сайта: снимается заглушка (`ComingSoon`/
 * `SectionPagePlaceholder`) или `hidden` из `src/data/mock.ts` — добавляется
 * запись сюда. **При правке списка страниц или их описаний — см. также
 * `src/routes/sitemap[.]xml.ts`** (перекрёстная ссылка на файл, который
 * независимо перечисляет те же страницы).
 *
 * Записи с описанием из `head()` страницы: текст для поиска — та же строка,
 * что в `head()` (без изменений в показе — обрезается только название
 * сайта, см. `stripSiteName` ниже), проверяется тестом
 * `tests/search-registry.test.ts`, который читает файл маршрута как текст.
 * **При правке `description` в head() страницы — см. также этот файл**
 * (обратная перекрёстная ссылка).
 *
 * Структура, Антидопинг, Устав и Руководство — не «страницы без данных»:
 * индексируется содержимое, а не общее описание (см. функции ниже; записи
 * Руководства и Устава собираются отдельно — по данным БД/генератора, не
 * здесь).
 */
import {
  STRUCTURE_INTRO,
  STRUCTURE_BOARD_CAPTION,
  STRUCTURE_NODES,
  CHARTER_BODIES,
  type StructureNode,
} from "@/lib/federation-structure";
import { ANTIDOPING_RESPONSIBLE, ANTIDOPING_GROUPS } from "@/data/antidoping";
import { ABOUT_PARAGRAPHS } from "@/lib/federation-about";
import { ORG_REQUISITES } from "@/lib/site";
import { clauseAnchorId } from "@/lib/charter/anchors";
import { CHARTER_TEXT_PATH, CHARTER_SECTION_TITLES } from "@/lib/charter/meta";
import type { CharterBlock, CharterContent } from "@/lib/charter/types";

export type StaticSectionEntry = {
  id: string;
  title: string;
  /** Сегменты между «Главная» и заголовком — например `["Федерация"]`; для верхнего уровня пусто. */
  breadcrumb: string[];
  href: string;
  text: string;
};

/**
 * Название сайта вырезается из текста для поиска (не из показа) — иначе по
 * словам «теннис», «Петербург», «федерация» совпадают все записи реестра
 * разом. Формы «Федерация/Федерации/Федерацию/Федерацией тенниса
 * Санкт-Петербурга» и сокращение «ФТ СПб».
 */
const SITE_NAME_RE = /федерац\S*\s+тенниса\s+санкт-петербурга/gi;
const SITE_ABBR_RE = /фт\s*спб/gi;

export function stripSiteName(text: string): string {
  return text.replace(SITE_NAME_RE, " ").replace(SITE_ABBR_RE, " ");
}

/**
 * Страницы с описанием из `head()` — буквально та же строка (см. doc-comment
 * модуля). Источник каждой — файл маршрута, указан в комментарии у записи.
 */
export function buildDescriptionSectionEntries(): StaticSectionEntry[] {
  return [
    {
      id: "page-news",
      title: "Новости",
      breadcrumb: [],
      href: "/news",
      // src/routes/_site.news.index.tsx — DESCRIPTION
      text: stripSiteName(
        "Все новости Федерации тенниса Санкт-Петербурга: общая лента и официальные новости Федерации.",
      ),
    },
    {
      id: "page-documents",
      title: "Документы",
      breadcrumb: [],
      href: "/documents",
      // src/routes/_site.documents.tsx — DESCRIPTION, плюс ключевые слова,
      // которых в description нет (в отличие от /federation/documents).
      text:
        stripSiteName(
          "Библиотека документов Федерации тенниса Санкт-Петербурга с фильтром по разделам.",
        ) + " положение регламент правила формы",
    },
    {
      id: "page-federation-news",
      title: "Новости Федерации",
      breadcrumb: ["Федерация"],
      href: "/federation/news",
      // src/routes/_site.federation.news.tsx — DESCRIPTION
      text: stripSiteName(
        "Официальные новости Федерации тенниса Санкт-Петербурга: решения Правления, собрания, события и объявления.",
      ),
    },
    {
      id: "page-federation-events",
      title: "События",
      breadcrumb: ["Федерация"],
      href: "/federation/events",
      // src/routes/_site.federation.events.tsx — DESCRIPTION
      text: stripSiteName(
        "Заседания Правления, общие собрания и другие события Федерации тенниса Санкт-Петербурга — даты, повестка и документы.",
      ),
    },
    {
      id: "page-federation-documents",
      title: "Документы",
      breadcrumb: ["Федерация"],
      href: "/federation/documents",
      // src/routes/_site.federation.documents.tsx — DESCRIPTION
      text: stripSiteName(
        "Официальные документы Федерации тенниса Санкт-Петербурга: положения, регламенты, правила и формы.",
      ),
    },
  ];
}

/**
 * «Структура» — не описание, а содержимое: вступление, подпись Правления,
 * все узлы (заголовок/надпись/подстрочник/пометка) и органы по Уставу
 * (заголовок/строка), плюс синонимы — «ревизионная комиссия», «ревизор»,
 * «КРО» так называют Контрольно-ревизионный орган в архивных новостях, а в
 * данных структуры этого слова нет вовсе.
 */
export function buildStructureSectionEntry(): StaticSectionEntry {
  const nodeText = (STRUCTURE_NODES as readonly StructureNode[])
    .flatMap((node) =>
      [node.title, node.eyebrow, node.summary, node.note].filter((v): v is string => Boolean(v)),
    )
    .join(" ");
  const bodyText = CHARTER_BODIES.flatMap((body) => [body.title, body.line]).join(" ");
  const text = [
    STRUCTURE_INTRO,
    STRUCTURE_BOARD_CAPTION,
    nodeText,
    bodyText,
    "ревизионная комиссия ревизор КРО",
  ].join(" ");
  return {
    id: "structure",
    title: "Структура",
    breadcrumb: ["Федерация"],
    href: "/federation/structure",
    text,
  };
}

/** «Общая информация» — текст «О Федерации» и реквизиты (содержимое, не описание из head()). */
export function buildAboutSectionEntry(): StaticSectionEntry {
  const requisitesText = [
    ORG_REQUISITES.fullName,
    ORG_REQUISITES.shortName,
    ORG_REQUISITES.ogrn,
    ORG_REQUISITES.registrationDateText,
    ORG_REQUISITES.address,
  ].join(" ");
  return {
    id: "federation-about",
    title: "Общая информация",
    breadcrumb: ["Федерация"],
    href: "/federation/about",
    text: [...ABOUT_PARAGRAPHS, "Реквизиты ОГРН", requisitesText].join(" "),
  };
}

/** «Антидопинг» — ответственный, заголовки групп и ссылок, примечания (без адресов ссылок). */
export function buildAntidopingSectionEntry(): StaticSectionEntry {
  const groupsText = ANTIDOPING_GROUPS.flatMap((group) => [
    group.title,
    ...group.links.flatMap((link) =>
      [link.title, link.note].filter((v): v is string => Boolean(v)),
    ),
  ]).join(" ");
  const text = [ANTIDOPING_RESPONSIBLE.name, groupsText].join(" ");
  return {
    id: "antidoping",
    title: "Антидопинг",
    breadcrumb: ["Федерация"],
    href: "/federation/antidoping",
    text,
  };
}

export type CharterFindingEntry = StaticSectionEntry & { kind: "section" | "clause" };

/**
 * Устав — не только пронумерованные пункты (`paragraph` с `clause`): абзацы
 * без номера и списки присоединяются текстом к текущему пункту, а до
 * первого пункта раздела — к самому разделу (якорь `razdel-N`, как в
 * `CharterText`/`CharterToc`). Порядок обхода — тот же, что рендерит
 * `CharterText`: `sections[].blocks[]` по порядку.
 */
export function buildCharterSectionEntries(content: CharterContent): CharterFindingEntry[] {
  const entries: CharterFindingEntry[] = [];
  let current: CharterFindingEntry | null = null;

  function blockText(block: CharterBlock): string {
    return block.kind === "paragraph" ? block.text : block.items.join(" ");
  }

  for (const section of content.sections) {
    current = {
      id: `charter-section-${section.number}`,
      kind: "section",
      title: `Устав, раздел ${section.number}`,
      breadcrumb: ["Федерация", "Устав"],
      href: `${CHARTER_TEXT_PATH}#razdel-${section.number}`,
      text: `${section.number}. ${CHARTER_SECTION_TITLES[section.number] ?? ""}`,
    };
    entries.push(current);

    for (const block of section.blocks) {
      if (block.kind === "paragraph" && block.clause !== undefined) {
        current = {
          id: `charter-clause-${block.clause}`,
          kind: "clause",
          title: `Устав, п. ${block.clause}`,
          breadcrumb: ["Федерация", "Устав"],
          href: `${CHARTER_TEXT_PATH}#${clauseAnchorId(block.clause)}`,
          text: blockText(block),
        };
        entries.push(current);
      } else {
        current.text = `${current.text} ${blockText(block)}`;
      }
    }
  }
  return entries;
}
