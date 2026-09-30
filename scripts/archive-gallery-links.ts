// Заглушка: реализация — следующим коммитом.
export function countGalleryLinks(_html: string, _page: string): number {
  return 0;
}

export function removeGalleryLink(html: string, _page: string): { html: string; removed: number } {
  return { html, removed: 0 };
}

export function rewriteGalleryLink(
  html: string,
  _page: string,
  _source: string,
): { html: string; rewritten: number } {
  return { html, rewritten: 0 };
}
