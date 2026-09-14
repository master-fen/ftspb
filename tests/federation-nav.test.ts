import { describe, expect, test } from "bun:test";
import {
  currentFederationHref,
  federationNavState,
  otherFederationGroups,
} from "@/lib/federation-nav";

describe("меню раздела «Федерация»", () => {
  test("/federation — это «Общая информация», прочие пути — как есть", () => {
    expect(currentFederationHref("/federation")).toBe("/federation/about");
    expect(currentFederationHref("/federation/structure")).toBe("/federation/structure");
  });

  test("явный activeHref важнее пути", () => {
    expect(currentFederationHref("/federation/charter/text", "/federation/charter")).toBe(
      "/federation/charter",
    );
  });

  test("группа и пункт текущей страницы", () => {
    const state = federationNavState("/federation/charter");
    expect(state?.group.label).toBe("О Федерации");
    expect(state?.item.label).toBe("Устав");
  });

  test("«остальные» — без текущего пункта, обе группы, порядок прежний", () => {
    const groups = otherFederationGroups("/federation/charter");
    expect(groups.map((g) => g.label)).toEqual(["О Федерации", "Деятельность"]);
    expect(groups.flatMap((g) => g.items.map((i) => i.label))).toEqual([
      "Общая информация",
      "Руководство",
      "Структура",
      "Новости Федерации",
      "События",
      "Документы",
    ]);
  });

  test("неизвестный путь — пункта нет, «остальные» — все семь", () => {
    expect(federationNavState("/federation/unknown")).toBeNull();
    expect(otherFederationGroups("/federation/unknown").flatMap((g) => g.items)).toHaveLength(7);
  });
});
