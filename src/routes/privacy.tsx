import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/site/ComingSoon";

const TITLE = "Политика конфиденциальности — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Политика конфиденциальности Федерации тенниса Санкт-Петербурга. Раздел в разработке.";

export const Route = createFileRoute("/privacy")({
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
      title="Политика конфиденциальности"
      description="Здесь будет опубликован документ о том, какие персональные данные обрабатывает Федерация тенниса Санкт-Петербурга, с какой целью они собираются и как обеспечивается их защита."
    />
  ),
});
