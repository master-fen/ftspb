import { createFileRoute } from "@tanstack/react-router";
import { SectionPagePlaceholder } from "@/components/site/SectionPagePlaceholder";

const TITLE = "События — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION = "События Федерации тенниса Санкт-Петербурга. Раздел в разработке.";

export const Route = createFileRoute("/federation/events")({
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
      title="События"
      description="Календарь городских теннисных мероприятий: семинары, показательные матчи, праздники спорта."
    />
  ),
});
