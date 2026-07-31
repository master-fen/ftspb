import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { allNews } from "@/data/mock";

const BASE_URL = "https://ftspb.lovable.app";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap/xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/news", changefreq: "daily", priority: "0.9" },
          { path: "/federation", changefreq: "weekly", priority: "0.7" },
          { path: "/federation/events", changefreq: "weekly", priority: "0.7" },
          { path: "/federation/documents", changefreq: "monthly", priority: "0.7" },
          { path: "/referees", changefreq: "weekly", priority: "0.7" },
          { path: "/teams", changefreq: "weekly", priority: "0.7" },
          { path: "/tournaments", changefreq: "daily", priority: "0.8" },
          { path: "/courts", changefreq: "weekly", priority: "0.7" },
          { path: "/documents", changefreq: "monthly", priority: "0.7" },
          { path: "/contacts", changefreq: "monthly", priority: "0.7" },
          ...allNews.map((news) => ({
            path: `/news/${news.id}`,
            changefreq: "monthly" as const,
            priority: "0.6",
          })),
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
