import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/site/ComingSoon";

const TITLE = "Федерация — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION = "Информация о Федерации тенниса Санкт-Петербурга. Раздел в разработке.";

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
    <ComingSoon
      title="Федерация"
      description="На этой странице мы расскажем об истории и миссии Федерации тенниса Санкт-Петербурга, руководстве, структуре и направлениях работы."
    />
  ),
});
