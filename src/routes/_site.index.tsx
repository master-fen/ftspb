import { createFileRoute } from "@tanstack/react-router";
import { FeaturedNewsSection } from "@/components/site/FeaturedNewsSection";
import { LatestNewsSection } from "@/components/site/LatestNewsSection";
import { getFeaturedAndLatest } from "@/lib/news-server-fn";

export const Route = createFileRoute("/_site/")({
  // Фон главной — bg-surface; рисует его рама _site (src/routes/_site.tsx).
  staticData: { siteBackground: "surface" },
  loader: () => getFeaturedAndLatest(),
  component: HomePage,
});

function HomePage() {
  const { featured, latest } = Route.useLoaderData();
  return (
    <main>
      <h1 className="sr-only">Федерация тенниса Санкт-Петербурга — официальный сайт и новости</h1>
      <FeaturedNewsSection items={featured} />
      <LatestNewsSection items={latest} />
    </main>
  );
}
