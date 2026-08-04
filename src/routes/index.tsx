import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { FeaturedNewsSection } from "@/components/site/FeaturedNewsSection";
import { LatestNewsSection } from "@/components/site/LatestNewsSection";
import { getFeaturedAndLatest } from "@/lib/news-server-fn";

export const Route = createFileRoute("/")({
  loader: () => getFeaturedAndLatest(),
  component: HomePage,
});

function HomePage() {
  const { featured, latest } = Route.useLoaderData();
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />
      <main className="flex-1">
        <h1 className="sr-only">Федерация тенниса Санкт-Петербурга — официальный сайт и новости</h1>
        <FeaturedNewsSection items={featured} />
        <LatestNewsSection items={latest} />
      </main>
      <SiteFooter />
    </div>
  );
}
