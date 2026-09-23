import { describe, expect, test } from "bun:test";
import { normalizeLeadText, shouldShowLead } from "@/lib/news-lead";

/**
 * Окно повтора проверяется поведением обеих границ, а не сверкой с
 * экспортированной константой: сверка была бы тавтологией, а границы ловят и
 * смену знака сравнения.
 */
const LEAD_ECHO_WINDOW = 1000;

/** Анонс длиннее порога значимости (20 знаков после нормализации). */
const LEAD = "Фестиваль теннисных городов пройдёт в Санкт-Петербурге 31 мая";

/** Эпиграф перед абзацем анонса — то, ради чего правило переписано. */
const EPIGRAPH = "<p>Канал-Фонтанка ярким светом переполнен, и фестивальный теплоход готов.</p>";

/** Текст нужной длины, которым набивается расстояние до повтора. */
function filler(length: number): string {
  return "а".repeat(length);
}

describe("показ анонса на странице новости", () => {
  test("анонс стоит ровно в начале тела — скрыт", () => {
    expect(shouldShowLead(LEAD, `<p>${LEAD}, и это будет праздник.</p>`)).toBe(false);
  });

  test("перед анонсом эпиграф — скрыт (прежнее правило показывало)", () => {
    expect(shouldShowLead(LEAD, `${EPIGRAPH}<p>${LEAD}, и это будет праздник.</p>`)).toBe(false);
  });

  test("повтор начинается ровно на границе окна — скрыт", () => {
    // Абзацы склеиваются одним пробелом, поэтому набивки на знак меньше окна.
    const body = `<p>${filler(LEAD_ECHO_WINDOW - 1)}</p><p>${LEAD}</p>`;
    expect(normalizeLeadText(body).indexOf(normalizeLeadText(LEAD))).toBe(LEAD_ECHO_WINDOW);
    expect(shouldShowLead(LEAD, body)).toBe(false);
  });

  test("повтор на знак дальше окна — показан", () => {
    const body = `<p>${filler(LEAD_ECHO_WINDOW)}</p><p>${LEAD}</p>`;
    expect(normalizeLeadText(body).indexOf(normalizeLeadText(LEAD))).toBe(LEAD_ECHO_WINDOW + 1);
    expect(shouldShowLead(LEAD, body)).toBe(true);
  });

  test("повтор в конце длинного текста (смещение 3536) — показан", () => {
    expect(shouldShowLead(LEAD, `<p>${filler(3536)}</p><p>${LEAD}</p>`)).toBe(true);
  });

  test("отличие только кавычками и многоточием — скрыт", () => {
    const excerpt = "«Фестиваль теннисных городов» пройдёт в Санкт-Петербурге…";
    const body = '<p>"Фестиваль теннисных городов" пройдёт в Санкт-Петербурге...</p>';
    expect(shouldShowLead(excerpt, body)).toBe(false);
  });

  test("отличие только пробелами и переводами строк — скрыт", () => {
    const body = `<p>Фестиваль   теннисных\n\nгородов пройдёт в\tСанкт-Петербурге 31 мая</p>`;
    expect(shouldShowLead(LEAD, body)).toBe(false);
  });

  test("анонса нет — показывать нечего", () => {
    expect(shouldShowLead(undefined, "<p>Текст новости.</p>")).toBe(false);
    expect(shouldShowLead(null, "<p>Текст новости.</p>")).toBe(false);
    expect(shouldShowLead("   ", "<p>Текст новости.</p>")).toBe(false);
  });

  test("проба короче 21 знака — показан даже при совпадении", () => {
    const short = "Итоги турнира";
    expect(normalizeLeadText(short).length).toBeLessThanOrEqual(20);
    expect(shouldShowLead(short, `<p>${short} подведены.</p>`)).toBe(true);
  });

  test("тела нет — анонс показан", () => {
    expect(shouldShowLead(LEAD, undefined)).toBe(true);
    expect(shouldShowLead(LEAD, "")).toBe(true);
  });

  test("тело анонса не содержит — показан", () => {
    expect(shouldShowLead(LEAD, "<p>Совсем другой текст про совсем другое событие.</p>")).toBe(
      true,
    );
  });

  test("нормализация: теги в пробел, кавычки и многоточие долой, регистр нижний", () => {
    expect(normalizeLeadText("<p>«Кубок»   Северной\nСтолицы…</p>")).toBe("кубок северной столицы");
  });
});
