/**
 * Реквизиты редакций Устава и отображаемые заголовки разделов для страниц
 * /federation/charter и /federation/charter/text. Источники значений — сам
 * документ (титульный лист); текст Устава лежит отдельно в ./content.ts.
 * Реквизиты организации (наименования, ОГРН, дата регистрации, адрес) —
 * `ORG_REQUISITES` в src/lib/site.ts.
 */
export const CHARTER_DOCUMENT_SLUG = "charter";

/** Адрес страницы полного текста Устава (src/routes/federation_.charter.text.tsx). */
export const CHARTER_TEXT_PATH = "/federation/charter/text";

export const CHARTER_META = {
  editionApprovedBy: "решением ежегодного Общего собрания членов", // титульный лист
  editionDate: "2016-03-17",
  editionDateText: "17 марта 2016 года",
  originalApprovedBy: "решением Учредительного собрания", // титульный лист
  originalDate: "2004-04-22",
  originalDateText: "22 апреля 2004 года",
} as const;

export const CHARTER_SECTION_TITLES: Record<number, string> = {
  1: "Общие положения",
  2: "Цели и задачи Федерации",
  3: "Виды деятельности Федерации",
  4: "Права и обязанности Федерации",
  5: "Члены Федерации, их права и обязанности",
  6: "Руководящие и ревизионные органы Федерации",
  7: "Имущество и средства Федерации",
  8: "Предпринимательская деятельность Федерации",
  9: "Символика Федерации",
  10: "Внесение изменений в Устав",
  11: "Ликвидация и реорганизация Федерации",
};
