/**
 * Ссылки строк поиска приходят с сервера одной строкой (`SearchResponse`),
 * а не парой `to`/`hash`, как того хочет `Link` — так делает и
 * `NEWS_PARENT`/`EVENT_PARENT` (см. серверные модули поиска). Клиенту нужно
 * разобрать: внешняя (S3, документ вне общего списка/в общем списке) даёт
 * `<a target="_blank">`, внутренняя с якорем (пункт Устава) — `to`+`hash`
 * отдельно, как у `CharterToc` (объединённая строка `path#hash` в `to` у
 * TanStack Router не работает как обычный href браузера).
 */
export type SearchLinkTarget = { to: string; hash?: string; external: boolean };

export function resolveSearchHref(href: string): SearchLinkTarget {
  if (/^https?:\/\//.test(href)) {
    return { to: href, external: true };
  }
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) {
    return { to: href, external: false };
  }
  return { to: href.slice(0, hashIndex), hash: href.slice(hashIndex + 1), external: false };
}
