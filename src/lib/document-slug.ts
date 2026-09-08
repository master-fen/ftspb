/**
 * Нормализация адреса публичной страницы документа (document.slug).
 * Формат: латиница в нижнем регистре и цифры, группы разделены одиночным
 * дефисом; пустой ввод означает «без адреса» (null).
 */
export const DOCUMENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const DOCUMENT_SLUG_MAX_LENGTH = 64;

export type NormalizeDocumentSlugResult =
  | { ok: true; slug: string | null }
  | { ok: false; error: string };

export function normalizeDocumentSlug(
  input: string | null | undefined,
): NormalizeDocumentSlugResult {
  const trimmed = (input ?? "").trim();
  if (trimmed === "") {
    return { ok: true, slug: null };
  }
  if (trimmed.length > DOCUMENT_SLUG_MAX_LENGTH) {
    return { ok: false, error: `Адрес длиннее ${DOCUMENT_SLUG_MAX_LENGTH} символов` };
  }
  if (!DOCUMENT_SLUG_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: "Адрес может содержать только латиницу в нижнем регистре, цифры и дефис между ними",
    };
  }
  return { ok: true, slug: trimmed };
}
