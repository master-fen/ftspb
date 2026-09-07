import type { NewsItem } from "@/lib/types/news";

export type NewsCache = {
  items: NewsItem[];
  featuredOrderById: Map<string, number>;
  /** slug → video_url как в колонке; в `items` не кладётся, чтобы списки его не отдавали. */
  videoUrlBySlug: Map<string, string | null>;
  expiresAt: number;
};

let cache: NewsCache | null = null;

export function getNewsCache(): NewsCache | null {
  return cache;
}

export function setNewsCache(next: NewsCache): void {
  cache = next;
}

export function resetNewsCache(): void {
  cache = null;
}
