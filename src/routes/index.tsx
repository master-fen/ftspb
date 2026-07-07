import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { FeaturedNewsSection } from "@/components/site/FeaturedNewsSection";
import { LatestNewsSection } from "@/components/site/LatestNewsSection";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />
      <main className="flex-1">
        <h1 className="sr-only">Федерация тенниса Санкт-Петербурга</h1>
        <FeaturedNewsSection />
        <LatestNewsSection />
      </main>
      <SiteFooter />
    </div>
  );
}
