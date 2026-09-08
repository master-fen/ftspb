/**
 * Структура полного текста Устава для страницы /federation/charter.
 * Наполняется генератором scripts/build-charter-content.ts из построчной
 * выгрузки текстового слоя PDF (docs/charter/ustav.lines.json).
 */
export type CharterBlock =
  | { kind: "paragraph"; text: string; clause?: string } // clause: "6.4" — абзац начинает нумерованный пункт
  | { kind: "list"; items: string[] };

export interface CharterSection {
  number: number;
  title: string; // как в оригинале, прописными
  blocks: CharterBlock[];
}

export interface CharterContent {
  preamble: string[][]; // титульный лист, группы строк
  sections: CharterSection[];
}
