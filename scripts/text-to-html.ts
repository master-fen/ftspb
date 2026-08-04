/**
 * Общий модуль для migrate-archive.ts и разовых фикс-скриптов — без побочных
 * эффектов при импорте (в отличие от migrate-archive.ts, который парсит argv
 * и запускает main() на верхнем уровне).
 *
 * `record["Текст"]` в исходном архиве — простой перенесённый по строкам текст
 * (абзацы разделены пустой строкой), не HTML. `news.body` в схеме — HTML,
 * рендерится на сайте через `dangerouslySetInnerHTML`. В mock.ts тот же текст
 * был вручную обёрнут в `<p>` без другой разметки (`<strong>`/`<a>`/списки
 * в архиве не встречаются) — здесь та же конвертация.
 */
export function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);

  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
}

/** Внутри текстового содержимого `<p>` (не атрибута) для безопасности достаточно `&`/`<`/`>`. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
