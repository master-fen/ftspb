import { createFileRoute } from "@tanstack/react-router";
import { SectionPagePlaceholder } from "@/components/site/SectionPagePlaceholder";

const TITLE = "О федерации — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Общая информация о Федерации тенниса Санкт-Петербурга: история, миссия и направления работы.";

export const Route = createFileRoute("/federation/about")({
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
      title="О Федерации"
      description="Здесь будет рассказ об истории, миссии и направлениях работы Федерации тенниса Санкт-Петербурга."
    />
  ),
});
