import { createFileRoute } from "@tanstack/react-router";
import { SectionPagePlaceholder } from "@/components/site/SectionPagePlaceholder";
import { listNews } from "@/lib/news-server-fn";

const TITLE = "Новости Федерации — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Официальные новости Федерации тенниса Санкт-Петербурга: решения Правления, собрания, события и объявления.";

export const Route = createFileRoute("/federation/news")({
  loader: () => listNews(),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: () => (
    <SectionPagePlaceholder
      title="Новости Федерации"
      description="Здесь будет отдельная лента официальных новостей Федерации."
    />
  ),
});
