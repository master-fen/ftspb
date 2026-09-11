import type { CharterContent } from "./types";

/**
 * Якоря пунктов Устава на странице полного текста (/federation/charter/text),
 * формат id для рендера (CharterText): пункт «6.4.» → `p-6-4`. Якоря разделов
 * (`razdel-N`) — отдельно, в CharterText/CharterToc.
 */
export function clauseAnchorId(clause: string): string {
  return `p-${clause.replace(".", "-")}`;
}

/** Номера нумерованных пунктов («6.4») всех разделов по порядку текста. */
export function listCharterClauses(content: CharterContent): string[] {
  return content.sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.kind === "paragraph" && block.clause !== undefined ? [block.clause] : [],
    ),
  );
}
