const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * 1024;

/** Человеко-читаемый размер файла: КБ ниже 1 МБ, иначе МБ с одним знаком
 * после запятой. */
export function formatFileSize(bytes: number): string {
  if (bytes < BYTES_PER_MB) {
    return `${Math.round(bytes / BYTES_PER_KB)} КБ`;
  }
  return `${(bytes / BYTES_PER_MB).toFixed(1)} МБ`;
}
