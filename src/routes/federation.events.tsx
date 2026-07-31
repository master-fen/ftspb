import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/site/ComingSoon";

const TITLE = "Мероприятия — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION = "Мероприятия Федерации тенниса Санкт-Петербурга. Раздел в разработке.";

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
    <ComingSoon
      title="Мероприятия"
      description="Здесь будет календарь городских теннисных мероприятий: семинары, показательные матчи, праздники спорта и другие события Федерации и партнёров."
    />
  ),
});
