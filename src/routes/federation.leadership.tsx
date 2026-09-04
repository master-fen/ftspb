import { createFileRoute } from "@tanstack/react-router";
import { SectionPagePlaceholder } from "@/components/site/SectionPagePlaceholder";

const TITLE = "Руководство — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Президент, вице-президенты и Правление Федерации тенниса Санкт-Петербурга: должности и зоны ответственности.";

export const Route = createFileRoute("/federation/leadership")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: () => (
    <SectionPagePlaceholder
      title="Руководство"
      description="Президент, вице-президенты, Правление: должности и зоны ответственности, контактные данные."
    />
  ),
});
