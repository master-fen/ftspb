import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/site/ComingSoon";

const TITLE = "Пользовательское соглашение — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Пользовательское соглашение сайта Федерации тенниса Санкт-Петербурга. Раздел в разработке.";

export const Route = createFileRoute("/terms")({
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
      title="Пользовательское соглашение"
      description="Здесь будут описаны правила использования сайта Федерации тенниса Санкт-Петербурга: условия доступа к материалам, права на контент и порядок взаимодействия с сервисами сайта."
    />
  ),
});
