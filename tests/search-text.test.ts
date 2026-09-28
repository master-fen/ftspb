import { describe, expect, test } from "bun:test";
import { matchesQuery, normalizeSearchQuery, visibleText } from "@/lib/search-text";

describe("visibleText", () => {
  test("слово только в <td> — находится", () => {
    expect(visibleText("<table><tr><td>Иванов</td></tr></table>")).toContain("Иванов");
  });

  test("слово только в <li> — находится", () => {
    expect(visibleText("<ul><li>Результат</li></ul>")).toContain("Результат");
  });

  test("слово только в <h3> — находится", () => {
    expect(visibleText("<h3>Заголовок</h3><p>Текст</p>")).toContain("Заголовок");
  });

  test("слово только в <div> без <p> — находится", () => {
    expect(visibleText("<div>Без абзаца</div>")).toContain("Без абзаца");
  });

  test("слово только в значении href — не находится", () => {
    const html = '<a href="povtor">видимый текст</a>';
    expect(visibleText(html)).not.toContain("povtor");
    expect(visibleText(html)).toContain("видимый текст");
  });

  test("слово только в имени тега — не находится", () => {
    expect(visibleText("<strong>жирный</strong>")).not.toContain("strong");
    expect(visibleText("<strong>жирный</strong>")).toContain("жирный");
  });

  test("содержимое <script>/<style> вырезается вместе с тегом", () => {
    const html = "<script>var secret = 1;</script><style>.a{color:red}</style><p>Видно</p>";
    const result = visibleText(html);
    expect(result).not.toContain("secret");
    expect(result).not.toContain("color");
    expect(result).toContain("Видно");
  });

  test("&nbsp; и &quot; декодируются", () => {
    expect(visibleText("Слово&nbsp;слово")).toBe("Слово слово");
    expect(visibleText("&quot;цитата&quot;")).toBe('"цитата"');
  });

  test("текст без тегов — decode+collapse, без изменений по смыслу", () => {
    expect(visibleText("  просто   текст  ")).toBe("просто текст");
  });

  test("null/undefined/пустая строка — пустая строка", () => {
    expect(visibleText(null)).toBe("");
    expect(visibleText(undefined)).toBe("");
    expect(visibleText("")).toBe("");
  });
});

describe("normalizeSearchQuery", () => {
  test("пробелы по краям отбрасываются", () => {
    expect(normalizeSearchQuery("  турнир  ")).toBe("турнир");
  });

  test("пустая строка и только пробелы → undefined", () => {
    expect(normalizeSearchQuery("")).toBeUndefined();
    expect(normalizeSearchQuery("   ")).toBeUndefined();
    expect(normalizeSearchQuery(undefined)).toBeUndefined();
  });
});

describe("matchesQuery", () => {
  test("регистр не важен для кириллицы: ТУРНИР/Турнир/турнир", () => {
    expect(matchesQuery("Городской турнир", "ТУРНИР")).toBe(true);
    expect(matchesQuery("Городской ТУРНИР", "турнир")).toBe(true);
    expect(matchesQuery("Городской Турнир", "турнир")).toBe(true);
  });

  test("ё и е взаимозаменяемы в обе стороны", () => {
    expect(matchesQuery("Победил Пётр Иванов", "Петр")).toBe(true);
    expect(matchesQuery("Победил ПЁТР Иванов", "петр")).toBe(true);
    expect(matchesQuery("Победил Петр Иванов", "пётр")).toBe(true);
  });

  test("% и _ — обычные символы, не шаблон", () => {
    expect(matchesQuery("Скидка 50% на абонемент", "50%")).toBe(true);
    expect(matchesQuery("файл_архива.pdf", "файл_архива")).toBe(true);
    expect(matchesQuery("турнир", "%")).toBe(false);
  });

  test("непересекающиеся строки не совпадают", () => {
    expect(matchesQuery("Новость о финале", "четвертьфинал")).toBe(false);
  });
});
