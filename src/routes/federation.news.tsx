import { createFileRoute } from "@tanstack/react-router";
import { SectionPagePlaceholder } from "@/components/site/SectionPagePlaceholder";

const TITLE = "Новости Федерации — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION = "Официальные новости Федерации тенниса Санкт-Петербурга. Раздел в разработке.";

export const Route = createFileRoute("/federation/news")({
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
      title="Новости"
      description="Здесь будет отдельная лента официальных новостей Федерации."
    />
  ),
});
