export type NavChild = { label: string; href: string };

export type NavSection = {
  label: string;
  href: string;
  children?: NavChild[];
  /**
   * Раздел не показывается в меню и подвале (фильтр в `src/data/mock.ts`,
   * экспорт `navSections`), но маршрут остаётся доступен по прямому адресу.
   */
  hidden?: boolean;
};
