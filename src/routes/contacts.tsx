import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/site/ComingSoon";

const TITLE = "Контакты — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION = "Контакты Федерации тенниса Санкт-Петербурга. Раздел в разработке.";

export const Route = createFileRoute("/contacts")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: () => <ComingSoon title="Контакты" />,
});
