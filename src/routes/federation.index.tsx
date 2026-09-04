import { createFileRoute } from "@tanstack/react-router";
import { SectionPagePlaceholder } from "@/components/site/SectionPagePlaceholder";

const TITLE = "Федерация — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Раздел о Федерации тенниса Санкт-Петербурга: руководство, структура, устав и деятельность.";

export const Route = createFileRoute("/federation/")({
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
      title="О федерации"
      description="Здесь будет рассказ об истории, миссии и направлениях работы Федерации тенниса Санкт-Петербурга. Выберите подраздел в навигаторе справа."
    />
  ),
});
