/** Канонический адрес сайта. Используется в canonical, og:url и абсолютных URL картинок. */
export const SITE_URL = "https://spbtennisfed.ru";

export const SITE_NAME = "Федерация тенниса Санкт-Петербурга";

/** Картинка для превью ссылок по умолчанию (1200x630). */
export const OG_IMAGE_URL = `${SITE_URL}/og-image.jpg`;

/** Приводит относительный путь к абсолютному URL на нашем домене. */
export function toAbsoluteUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (/^https?:\/\//.test(src)) return src;
  return `${SITE_URL}${src.startsWith("/") ? "" : "/"}${src}`;
}
