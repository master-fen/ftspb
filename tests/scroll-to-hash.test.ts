import { describe, expect, test } from "bun:test";
import { easeInOutCubic, targetScrollTop } from "@/lib/scroll-to-hash";

describe("targetScrollTop", () => {
  test("вычитает ненулевой scroll-margin-top", () => {
    // Элемент на 500px ниже верха окна, страница прокручена на 1200,
    // у элемента scroll-mt-24 (96px): 500 + 1200 − 96.
    expect(targetScrollTop({ rectTop: 500, scrollY: 1200, scrollMarginTop: 96 })).toBe(1604);
  });

  test("без отступа — просто верх элемента в координатах страницы", () => {
    expect(targetScrollTop({ rectTop: 500, scrollY: 1200, scrollMarginTop: 0 })).toBe(1700);
  });

  test("элемент выше текущей позиции — цель меньше текущей прокрутки", () => {
    expect(targetScrollTop({ rectTop: -300, scrollY: 1200, scrollMarginTop: 96 })).toBe(804);
  });

  test("отступ больше положения элемента — отрицательная цель не скрывается", () => {
    // Ограничение рамками страницы — забота вызывающего кода, не этой функции.
    expect(targetScrollTop({ rectTop: 10, scrollY: 0, scrollMarginTop: 96 })).toBe(-86);
  });
});

describe("easeInOutCubic", () => {
  test("0 → 0 и 1 → 1", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  test("монотонно возрастает на десяти точках", () => {
    const points = Array.from({ length: 10 }, (_, i) => i / 9);
    const values = points.map(easeInOutCubic);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBe(1);
  });

  test("не выходит за [0, 1] при аргументах вне диапазона", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });

  test("середина пути — половина", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
  });
});
