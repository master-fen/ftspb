import { describe, expect, test } from "bun:test";
import { buildFieldWithPositions } from "@/lib/search-field-index";
import { extractFragment, fragmentToPlainMarked } from "@/lib/search-fragment";
import { parseSearchQuery } from "@/lib/search-query";

function fragmentFor(text: string, query: string, targetLen?: number) {
  const field = buildFieldWithPositions(text);
  const terms = parseSearchQuery(query).terms;
  return extractFragment(field, terms, targetLen);
}

describe("extractFragment — границы слов и многоточия", () => {
  test("окно не режет слово по границе", () => {
    const words = Array.from({ length: 60 }, (_, i) => `слово${i}`);
    const text = words.join(" ") + " турнир " + words.join(" ");
    const spans = fragmentFor(text, "турнир", 40);
    const plain = spans.map((s) => s.text).join("");
    for (const word of plain.split(" ")) {
      const stripped = word.replace(/^…/, "").replace(/…$/, "");
      if (stripped === "") continue;
      expect(text.includes(stripped)).toBe(true);
    }
  });

  test("многоточие спереди и сзади, когда текст обрезан с обеих сторон", () => {
    const words = Array.from({ length: 60 }, (_, i) => `слово${i}`);
    const text = words.join(" ") + " турнир " + words.join(" ");
    const spans = fragmentFor(text, "турнир", 40);
    expect(spans[0].text).toBe("…");
    expect(spans[0].highlighted).toBe(false);
    expect(spans[spans.length - 1].text).toBe("…");
  });

  test("короткий текст — без многоточий", () => {
    const spans = fragmentFor("городской турнир по теннису", "турнир", 200);
    expect(spans.some((s) => s.text === "…")).toBe(false);
  });
});

describe("extractFragment — подсветка всех форм", () => {
  test("подсвечивает и точную форму, и другую форму того же слова", () => {
    const spans = fragmentFor("итоги первенства и первенство года", "первенство");
    const highlighted = spans.filter((s) => s.highlighted).map((s) => s.text);
    expect(highlighted).toContain("первенства");
    expect(highlighted).toContain("первенство");
  });

  test("составной термин подсвечивает слитную форму целиком", () => {
    const spans = fragmentFor("матч в Санкт-Петербурге", "Санкт-Петербург");
    const highlighted = spans.filter((s) => s.highlighted).map((s) => s.text);
    expect(highlighted).toContain("Санкт-Петербурге");
  });
});

describe("extractFragment — пустой текст и совпадение только в заголовке", () => {
  test("пустой текст — пустой массив отрезков", () => {
    expect(fragmentFor("", "турнир")).toEqual([]);
  });

  test("совпадения в этом поле нет — фрагмент от начала без подсветки", () => {
    const spans = fragmentFor("текст без искомого слова про федерацию", "турнир");
    expect(spans.every((s) => !s.highlighted)).toBe(true);
    expect(spans.length).toBeGreaterThan(0);
  });
});

describe("fragmentToPlainMarked", () => {
  test("подсвеченные слова заключаются в **", () => {
    const spans = [
      { text: "до ", highlighted: false },
      { text: "турнир", highlighted: true },
      { text: " после", highlighted: false },
    ];
    expect(fragmentToPlainMarked(spans)).toBe("до **турнир** после");
  });
});
