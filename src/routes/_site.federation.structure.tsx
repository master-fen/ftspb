import { createFileRoute, Link } from "@tanstack/react-router";
import { FederationStructure } from "@/components/federation/FederationStructure";
import { CHARTER_TEXT_PATH } from "@/lib/charter/meta";
import { CHARTER_BODIES, STRUCTURE_INTRO } from "@/lib/federation-structure";

const TITLE = "Структура — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Структура Федерации тенниса Санкт-Петербурга: органы управления, состав Правления и распределение направлений.";

export const Route = createFileRoute("/_site/federation/structure")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: StructurePage,
});

/**
 * Рама, крошки «Главная / Федерация / Структура» и навигация раздела — из
 * раскладки src/routes/_site.federation.tsx (как у /federation/leadership).
 */
function StructurePage() {
  return (
    <article>
      <h1 className="ui-h1">Структура</h1>
      <p className="mt-5 max-w-2xl font-ui text-[16px] leading-[24px] text-muted-foreground">
        {STRUCTURE_INTRO}
      </p>

      <FederationStructure className="mt-8" />

      <section
        aria-labelledby="charter-bodies-title"
        className="mt-10 font-ui text-base leading-[1.6] text-foreground"
      >
        <h2 id="charter-bodies-title" className="ui-h2">
          Органы Федерации по Уставу
        </h2>
        <div className="mt-4 space-y-6">
          {CHARTER_BODIES.map((body) => (
            <div key={body.id}>
              <h3 className="ui-h3">{body.title}</h3>
              <p className="mt-2 text-foreground/80">{body.line}</p>
            </div>
          ))}
        </div>
        <p className="mt-6">
          <Link to={CHARTER_TEXT_PATH} className="font-bold text-brand-blue ui-link">
            Полный текст Устава
          </Link>
        </p>
      </section>
    </article>
  );
}
