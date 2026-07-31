import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/site/ComingSoon";

const TITLE = "Документы Федерации — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Официальные документы Федерации тенниса Санкт-Петербурга. Раздел в разработке.";

export const Route = createFileRoute("/federation/documents")({
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
      title="Документы Федерации"
      description="В этом разделе будут собраны официальные документы Федерации тенниса Санкт-Петербурга: устав, положения, решения и административные регламенты."
    />
  ),
});
