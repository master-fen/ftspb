const TABLE_RE = /<table\b[\s\S]*?<\/table>/gi;

/**
 * Каждая таблица тела новости — в обёртке `.news-table` с горизонтальной
 * прокруткой (`.news-prose .news-table` в src/styles.css): на узком экране
 * прокручивается таблица внутри обёртки, а не страница. Обёртка, а не
 * `display: block` у самой таблицы: блочная таблица теряет табличную роль в
 * дереве доступности, а `role` санитайзер не пропускает. Зовёт NewsBody в
 * HTML-ветке; текст без таблиц не меняется.
 */
export function wrapTables(html: string): string {
  return html.replace(TABLE_RE, (table) => `<div class="news-table">${table}</div>`);
}
