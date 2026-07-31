import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/site/ComingSoon";

const TITLE = "Сборные команды — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION = "Сборные команды Санкт-Петербурга по теннису. Раздел в разработке.";

export const Route = createFileRoute("/teams")({
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
      title="Сборные команды"
      description="Здесь будет информация о сборных командах Санкт-Петербурга по теннису: составы, тренерский штаб, расписание учебно-тренировочных сборов и результаты выступлений."
    />
  ),
});
