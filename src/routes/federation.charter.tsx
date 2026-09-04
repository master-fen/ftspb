import { createFileRoute } from "@tanstack/react-router";
import { SectionPagePlaceholder } from "@/components/site/SectionPagePlaceholder";

const TITLE = "Устав — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION = "Устав Федерации тенниса Санкт-Петербурга и связанные с ним документы.";

export const Route = createFileRoute("/federation/charter")({
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
      title="Устав"
      description="Действующая редакция устава Федерации и сопутствующие правовые документы."
    />
  ),
});
