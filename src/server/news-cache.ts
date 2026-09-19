import type { NewsCardItem } from "@/lib/types/news";

export type NewsCache = {
  /**
   * Карточки всех опубликованных новостей в порядке выборки
   * (`published_at desc, created_at desc, id desc`). Тел, галерей, видео и
   * вложений здесь нет — их читает деталка отдельным запросом по слагу.
   */
  items: NewsCardItem[];
  /** slug → featured_order у главных новостей; в карточке порядка нет. */
  featuredOrderById: Map<string, number>;
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
