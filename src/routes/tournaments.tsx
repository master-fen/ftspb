import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/site/ComingSoon";

const TITLE = "Турниры — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION = "Турниры по теннису в Санкт-Петербурге. Раздел в разработке.";

export const Route = createFileRoute("/tournaments")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: () => <ComingSoon title="Турниры" />,
});
