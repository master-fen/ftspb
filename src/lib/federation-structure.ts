/**
 * Структура органов управления Федерации для страницы /federation/structure.
 * Один массив STRUCTURE_NODES — источник схемы, плоского списка и типа id
 * (StructureNodeId): карта размещения узлов в сетке компонента
 * FederationStructure обязана покрыть все узлы, иначе не соберётся.
 * Уровень узла не хранится — выводится из цепочки `parent` (structureLevel).
 * Тексты — по Уставу, раздел 6.
 */
export type StructureNodeKind = "body" | "position";

export type StructureNode = {
  id: string;
  title: string;
  kind: StructureNodeKind;
  parent: string | null; // null только у корня
  eyebrow?: string; // надпись над заголовком
  summary?: string; // одна строка под заголовком
  note?: string; // пометка (для КРО)
};

export type CharterBody = { id: string; title: string; line: string };

/** Порядок массива — порядок вывода. */
export const STRUCTURE_NODES = [
  { id: "assembly", title: "Общее собрание", kind: "body", parent: null },
  {
    id: "audit",
    title: "Контрольно-ревизионный орган",
    kind: "body",
    parent: "assembly",
    note: "Избирается Общим собранием, Правлению не подчиняется",
  },
  { id: "president", title: "Президент", kind: "position", parent: "assembly" },
  { id: "office", title: "Аппарат Федерации", kind: "body", parent: "president" },
  {
    id: "vp-general",
    title: "Вице-президент по общим вопросам",
    kind: "position",
    parent: "president",
  },
  {
    id: "vp-sport",
    title: "Вице-президент по спортивной работе",
    kind: "position",
    parent: "president",
  },
  {
    id: "facilities",
    eyebrow: "Член Правления",
    title: "Развитие материальной базы, финансовое обеспечение, маркетинг",
    kind: "position",
    parent: "vp-general",
  },
  {
    id: "methodics",
    eyebrow: "Член Правления",
    title: "Научно-методическое обеспечение, спортивные школы",
    kind: "position",
    parent: "vp-general",
  },
  {
    id: "secretary",
    eyebrow: "Член Правления",
    title: "Ответственный секретарь",
    summary: "Информационное обеспечение, организация соревнований",
    kind: "position",
    parent: "vp-general",
  },
  {
    id: "clubs",
    eyebrow: "Член Правления",
    title: "Клубный и массовый теннис, ветеранский теннис, теннис на колясках",
    kind: "position",
    parent: "vp-sport",
  },
  {
    id: "coaches",
    eyebrow: "Член Правления",
    title: "Председатель Тренерского совета",
    kind: "position",
    parent: "vp-sport",
  },
  {
    id: "referees",
    eyebrow: "Член Правления",
    title: "Председатель Коллегии судей",
    kind: "position",
    parent: "vp-sport",
  },
] as const satisfies readonly StructureNode[];

export type StructureNodeId = (typeof STRUCTURE_NODES)[number]["id"];

/**
 * Уровень узла: 0 у корня, дальше — длина цепочки `parent`. Параметр — союз
 * StructureNodeId, а не string: опечатка в вызове должна падать компиляцией,
 * а не молча возвращать 0.
 */
export function structureLevel(id: StructureNodeId): number {
  let level = 0;
  let current: StructureNode | undefined = STRUCTURE_NODES.find((node) => node.id === id);
  while (current && current.parent !== null) {
    const parentId: string = current.parent;
    current = STRUCTURE_NODES.find((node) => node.id === parentId);
    level += 1;
  }
  return level;
}

export const STRUCTURE_INTRO =
  "Структура управления Федерацией определена Уставом: высший орган — Общее собрание, между собраниями работает Правление из девяти человек во главе с Президентом, контроль осуществляет независимый Контрольно-ревизионный орган.";

export const STRUCTURE_BOARD_CAPTION =
  "Правление — 9 человек: Президент, два вице-президента и шесть членов Правления.";

/**
 * Порядок массива — порядок вывода. Номеров пунктов Устава у органов нет
 * намеренно: проставленные вручную, они с содержанием не сверялись (у
 * Тренерского совета и Коллегии судей стоял 6.13 — пункт об Ответственном
 * секретаре).
 */
export const CHARTER_BODIES = [
  {
    id: "assembly",
    title: "Общее собрание",
    line: "Высший орган Федерации. Собирается ежегодно; раз в четыре года проводится отчётно-выборное собрание, которое избирает Президента, Правление и Контрольно-ревизионный орган.",
  },
  {
    id: "board",
    title: "Правление",
    line: "Постоянно действующий руководящий орган между собраниями. Девять человек, избираются на четыре года. В состав обязательно входят Президент, два вице-президента, ответственный секретарь, председатели Тренерского совета и Коллегии судей.",
  },
  {
    id: "president",
    title: "Президент",
    line: "Избирается Общим собранием на четыре года. Возглавляет Федерацию, созывает и ведёт заседания Правления, представляет Общему собранию кандидатуры вице-президентов, ответственного секретаря и председателей Тренерского совета и Коллегии судей.",
  },
  {
    id: "audit",
    title: "Контрольно-ревизионный орган",
    line: "Избирается Общим собранием на четыре года; контролирует соблюдение Устава и финансовую деятельность Федерации, проводит проверки не реже одного раза в полгода. Его члены не могут входить в Правление.",
  },
  {
    id: "coaches",
    title: "Тренерский совет",
    line: "Формирует основной и резервный составы сборных команд города и отвечает за их подготовку к всероссийским и международным соревнованиям. Председатель избирается Общим собранием по представлению Президента.",
  },
  {
    id: "referees",
    title: "Коллегия судей",
    line: "Готовит судейские кадры и отвечает за качество судейства городских первенств и чемпионата, соревнований Российского теннисного тура и международных турниров в Санкт-Петербурге. Председатель избирается Общим собранием по представлению Президента.",
  },
] as const satisfies readonly CharterBody[];
