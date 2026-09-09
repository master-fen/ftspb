import { Fragment } from "react";
import { clauseAnchorId } from "@/lib/charter/anchors";
import { CHARTER_SECTION_TITLES } from "@/lib/charter/meta";
import type { CharterContent } from "@/lib/charter/types";

/**
 * Полный текст Устава: преамбула титульного листа и 11 разделов. Текст
 * рендерится только JSX-текстом, как есть — без типографирования и без
 * dangerouslySetInnerHTML. Номера пунктов остаются в тексте абзацев.
 */
export function CharterText({ content }: { content: CharterContent }) {
  return (
    <div className="mt-8 space-y-8">
      <header className="space-y-4">
        {content.preamble.map((group, groupIndex) => (
          <p key={groupIndex}>
            {group.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {line}
              </Fragment>
            ))}
          </p>
        ))}
      </header>

      {content.sections.map((section) => (
        <section key={section.number} id={`razdel-${section.number}`} className="scroll-mt-24">
          <h2 className="font-sans text-2xl font-medium text-foreground">
            {section.number}. {CHARTER_SECTION_TITLES[section.number]}
          </h2>
          <div className="mt-3 space-y-3">
            {section.blocks.map((block, blockIndex) =>
              block.kind === "paragraph" ? (
                <p
                  key={blockIndex}
                  id={block.clause !== undefined ? clauseAnchorId(block.clause) : undefined}
                >
                  {block.text}
                </p>
              ) : (
                <ul key={blockIndex} className="list-disc space-y-1 pl-6">
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
