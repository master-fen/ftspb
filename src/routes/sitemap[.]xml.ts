import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { listPublishedEventSlugs } from "@/server/events";
import { listNews } from "@/server/news";
import { SITE_URL } from "@/lib/site";

const BASE_URL = SITE_URL;

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const [items, eventSlugs] = await Promise.all([listNews(), listPublishedEventSlugs()]);
        // Только страницы без noindex. Разделы-заглушки (ComingSoon /
        // SectionPagePlaceholder, постоянный noindex в head()) и /federation
        // (редирект на /federation/about с noindex) в карту не включаются;
        // возвращать запись вместе со снятием noindex страницы и флага hidden
        // в src/data/mock.ts.
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/news", changefreq: "daily", priority: "0.9" },
          { path: "/documents", changefreq: "monthly", priority: "0.6" },
          { path: "/federation/charter", changefreq: "yearly", priority: "0.5" },
          { path: "/federation/charter/text", changefreq: "yearly", priority: "0.6" },
          { path: "/federation/documents", changefreq: "monthly", priority: "0.6" },
          // Список — без ?year=: страницы годов достижимы по чипам, а в карту
          // идут сами события.
          { path: "/federation/events", changefreq: "weekly", priority: "0.7" },
          { path: "/federation/leadership", changefreq: "weekly", priority: "0.7" },
          { path: "/federation/news", changefreq: "daily", priority: "0.9" },
          ...items.map((news) => ({
            path: `/news/${news.id}`,
            changefreq: "monthly" as const,
            priority: "0.6",
          })),
          ...eventSlugs.map((slug) => ({
            path: `/federation/events/${slug}`,
            changefreq: "monthly" as const,
            priority: "0.5",
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
