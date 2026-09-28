/**
 * Построение части индекса поиска «Разделы сайта» — статический реестр
 * (`src/lib/search-registry.ts`: страницы с описанием, Структура,
 * Антидопинг, пункты Устава) плюс Руководство — по строке на каждое
 * опубликованное лицо: заголовок «ФИО — должность», текст — `bio`
 * (публичная карточка лица его уже показывает); `phone`/`email` не входят.
 */
import { charterContent } from "@/lib/charter/content";
import { buildFieldWithPositions, type FieldWithPositions } from "@/lib/search-field-index";
import {
  buildAntidopingSectionEntry,
  buildCharterSectionEntries,
  buildDescriptionSectionEntries,
  buildStructureSectionEntry,
  type StaticSectionEntry,
} from "@/lib/search-registry";
import { listPublishedPersons } from "@/server/federation-person";

export type SectionIndexItem = {
  id: string;
  href: string;
  breadcrumb: string[];
  title: FieldWithPositions;
  text: FieldWithPositions;
  /** Позиция в реестре — вторичный ключ сортировки при равной оценке (docs/decisions.md). */
  order: number;
};

function toIndexItem(
  entry: StaticSectionEntry,
  order: number,
  intern: (value: string) => string,
): SectionIndexItem {
  return {
    id: entry.id,
    href: entry.href,
    breadcrumb: entry.breadcrumb,
    title: buildFieldWithPositions(entry.title, intern),
    text: buildFieldWithPositions(entry.text, intern),
    order,
  };
}

export async function buildSectionsIndex(
  intern: (value: string) => string,
): Promise<SectionIndexItem[]> {
  const staticEntries: StaticSectionEntry[] = [
    ...buildDescriptionSectionEntries(),
    buildStructureSectionEntry(),
    buildAntidopingSectionEntry(),
    ...buildCharterSectionEntries(charterContent),
  ];

  const persons = await listPublishedPersons();
  const personEntries: StaticSectionEntry[] = persons.map((person) => ({
    id: `person-${person.id}`,
    title: `${person.fullName} — ${person.role}`,
    breadcrumb: ["Федерация"],
    href: "/federation/leadership",
    text: person.bio ?? "",
  }));

  return [...staticEntries, ...personEntries].map((entry, order) =>
    toIndexItem(entry, order, intern),
  );
}
