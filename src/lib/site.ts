/** Канонический адрес сайта. Используется в canonical, og:url и абсолютных URL картинок. */
export const SITE_URL = "https://spbtennisfed.ru";

/**
 * Боевые адреса: только на них грузится счётчик Метрики (`src/lib/analytics.ts`).
 * К запуску сайт переедет на `tennisfed.spb.ru` — оба домена в списке заранее.
 */
export const PRODUCTION_HOSTS: readonly string[] = [
  "spbtennisfed.ru",
  "www.spbtennisfed.ru",
  "tennisfed.spb.ru",
  "www.tennisfed.spb.ru",
];

export const SITE_NAME = "Федерация тенниса Санкт-Петербурга";

/** Картинка для превью ссылок по умолчанию (1200x630). */
export const OG_IMAGE_URL = `${SITE_URL}/og-image.jpg`;

/** Приводит относительный путь к абсолютному URL на нашем домене. */
export function toAbsoluteUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (/^https?:\/\//.test(src)) return src;
  return `${SITE_URL}${src.startsWith("/") ? "" : "/"}${src}`;
}

/**
 * Реквизиты организации — единственный источник для страниц Устава,
 * «Общей информации» и подвала (адрес в `siteMeta` читается отсюда же).
 * Источник значений — Устав, пункты указаны у каждого поля.
 */
export const ORG_REQUISITES = {
  fullName:
    "Санкт-Петербургская Региональная общественная организация «Спортивная Федерация тенниса»", // Устав п. 1.4
  shortName: "СПб РОО «Федерация тенниса»", // Устав п. 1.4
  ogrn: "1047831002614", // Устав п. 1.3
  registrationDate: "2004-05-27", // Устав п. 1.3, 1.6
  registrationDateText: "27 мая 2004 года",
  address: "193230, Санкт-Петербург, пер. Челиева, дом 13, корпус 3, литера Т, помещение 16", // Устав п. 1.10
} as const;

/** Контакты Федерации для страницы «Общая информация». */
export const ORG_CONTACTS = {
  phone: "+7 (812) 935-5903",
  email: "tennisfedspb@yandex.ru",
} as const;
