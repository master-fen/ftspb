import { describe, expect, test } from "bun:test";
import {
  CARD_EXCERPT_MAX,
  PAGE_DESCRIPTION_MAX,
  cardExcerpt,
  pageDescription,
  paragraphText,
  truncateAtSentence,
} from "@/lib/news-excerpt";

/** 121 × 24 знака = 2904: свой анонс длиннее 2900, как в архиве. */
const LONG_EXCERPT = "Это предложение анонса. ".repeat(121);

describe("truncateAtSentence", () => {
  test("предложение помещается: набираются целые предложения, третье не влезло", () => {
    const input = "Первое предложение. Второе предложение здесь. Третье.";
    expect(truncateAtSentence(input, 50)).toBe("Первое предложение. Второе предложение здесь.");
  });

  test("первое предложение длиннее порога: обрез по слову, многоточие, итог ≤ порога", () => {
    const input = "Очень длинное первое предложение без единой точки внутри которое не помещается";
    const out = truncateAtSentence(input, 30);
    expect(out).toBe("Очень длинное первое…");
    expect(out.length).toBeLessThanOrEqual(30);
  });

  test("порог 150: первое предложение из 30 слов режется на 24 слова с многоточием", () => {
    const out = truncateAtSentence("слово ".repeat(30), 150);
    expect(out).toBe(`${Array(24).fill("слово").join(" ")}…`);
    expect(out.length).toBe(144);
  });

  test("ровно на пороге — целиком, без многоточия", () => {
    expect(truncateAtSentence("абвгд", 5)).toBe("абвгд");
  });

  test("знаки препинания перед многоточием срезаются", () => {
    expect(truncateAtSentence("один, два, три, четыре пять", 12)).toBe("один, два…");
  });

  test("пробелы и переводы строк схлопываются до сравнения с порогом", () => {
    expect(truncateAtSentence("  Заседание\n\nПравления.  ", 40)).toBe("Заседание Правления.");
  });
});

describe("paragraphText", () => {
  test("таблица в начале тела в анонс не попадает", () => {
    const body =
      "<table><thead><tr><th>Место</th><th>Игрок</th></tr></thead>" +
      "<tbody><tr><td>1</td><td>Иванов</td></tr></tbody></table>" +
      "<p>Сборная выиграла матч.</p>";
    expect(paragraphText(body)).toBe("Сборная выиграла матч.");
  });

  test("пустое тело и тело из пустого абзаца", () => {
    expect(paragraphText("")).toBe("");
    expect(paragraphText(null)).toBe("");
    expect(paragraphText(undefined)).toBe("");
    expect(paragraphText("<p> </p>")).toBe("");
  });

  test("тело без тегов берётся целиком, абзацы через пробел", () => {
    expect(paragraphText("Первый абзац.\n\nВторой абзац.")).toBe("Первый абзац. Второй абзац.");
  });

  test("тело из заголовка и списка без абзацев — текст остатка без тегов", () => {
    expect(paragraphText("<h2>Итоги</h2><ul><li>раз</li><li>два</li></ul>")).toBe("Итоги раз два");
  });

  test("пустой первый абзац с nbsp пропускается, br — пробел", () => {
    expect(paragraphText("<p>&nbsp;</p><p>Первая<br>вторая строка</p>")).toBe(
      "Первая вторая строка",
    );
  });

  test("сущности sanitize-html и числовые декодируются", () => {
    expect(
      paragraphText("<p>Кубок &amp; Первенство &#1057;&#1055;&#1073; &quot;Юг&quot;</p>"),
    ).toBe('Кубок & Первенство СПб "Юг"');
  });
});

describe("cardExcerpt и pageDescription", () => {
  test("пороги — 150 и 200", () => {
    expect(CARD_EXCERPT_MAX).toBe(150);
    expect(PAGE_DESCRIPTION_MAX).toBe(200);
  });

  test("свой анонс приоритетнее тела", () => {
    expect(cardExcerpt("Свой анонс.", "<p>Тело новости.</p>")).toBe("Свой анонс.");
  });

  test("свой анонс из одних пробелов — берётся начало тела", () => {
    expect(cardExcerpt("   ", "<p>Начало тела.</p>")).toBe("Начало тела.");
  });

  test("пустое тело и пустой анонс — пустая строка (карточка без текста)", () => {
    expect(cardExcerpt(null, null)).toBe("");
    expect(cardExcerpt(undefined, "")).toBe("");
  });

  test("свой анонс длиной 2900 знаков режется тем же правилом: 6 предложений, 143 знака", () => {
    expect(LONG_EXCERPT.length).toBeGreaterThanOrEqual(2900);
    const out = cardExcerpt(LONG_EXCERPT, "<p>Тело.</p>");
    expect(out).toBe(Array(6).fill("Это предложение анонса.").join(" "));
    expect(out.length).toBe(143);
  });

  test("порог 200 для описания: тот же анонс даёт 8 предложений, 191 знак", () => {
    const out = pageDescription(LONG_EXCERPT, null);
    expect(out).toBe(Array(8).fill("Это предложение анонса.").join(" "));
    expect(out.length).toBe(191);
  });

  test("описание без анонса — начало тела по абзацам, таблица не учитывается", () => {
    const body = "<table><tr><td>1</td></tr></table><p>Первое. Второе.</p>";
    expect(pageDescription(null, body)).toBe("Первое. Второе.");
  });
});
