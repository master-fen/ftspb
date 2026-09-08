/**
 * Формат даты `ГГГГ-ММ-ДД` → `ДД.ММ.ГГГГ` без участия таймзоны (чистая
 * перестановка строк). Не-ISO вход возвращается как есть — на странице
 * лучше показать сырую строку, чем «Invalid Date».
 */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatIsoDateRu(iso: string): string {
  const match = ISO_DATE_PATTERN.exec(iso);
  if (match === null) {
    return iso;
  }
  return `${match[3]}.${match[2]}.${match[1]}`;
}
