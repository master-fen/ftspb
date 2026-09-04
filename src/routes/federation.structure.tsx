import { createFileRoute } from "@tanstack/react-router";
import { SectionPagePlaceholder } from "@/components/site/SectionPagePlaceholder";

const TITLE = "Структура — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Структура Федерации тенниса Санкт-Петербурга: органы управления, комитеты и комиссии.";

export const Route = createFileRoute("/federation/structure")({
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
      title="Структура"
      description="Схема органов управления Федерации, комитеты, комиссии и их состав."
    />
  ),
});
