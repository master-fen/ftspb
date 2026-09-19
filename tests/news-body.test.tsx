import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NewsBody } from "@/components/site/NewsBody";
import { wrapTables } from "@/lib/news-tables";
import { sanitizeBody } from "@/server/sanitize";

test("обычный текст: пустые строки становятся отдельными абзацами", () => {
  const html = renderToStaticMarkup(<NewsBody body={"Первый\n\nВторой\r\n\r\nТретий"} />);
  expect(html.match(/<p>/g)).toHaveLength(3);
  expect(html).toContain("Третий</p>");
});

test("одиночный перенос сохраняется внутри абзаца", () => {
  const html = renderToStaticMarkup(<NewsBody body={"Первая строка\nВторая строка"} />);
  expect(html.match(/<p>/g)).toHaveLength(1);
  expect(html).toContain("Первая строка<br>Вторая строка");
});

test("очищенный архивный HTML сохраняет ссылки, списки и выделения", () => {
  const body = '<p><strong>Архив</strong></p><ul><li><a href="/news">Новости</a></li></ul>';
  expect(renderToStaticMarkup(<NewsBody body={body} />)).toContain(body);
});

test("знаки сравнения в обычном тексте не превращаются в HTML", () => {
  const html = renderToStaticMarkup(<NewsBody body={sanitizeBody("2 < 3 & 4 > 1")} />);
  expect(html).toContain("2 &lt; 3 &amp; 4 &gt; 1");
});

test("серверная очистка сохраняет безопасность и в обычном тексте", () => {
  const body = sanitizeBody("Текст\n\n<script>alert(1)</script><img src=x onerror=alert(1)>Конец");
  const html = renderToStaticMarkup(<NewsBody body={body} />);
  expect(html).not.toContain("script");
  expect(html).not.toContain("onerror");
  expect(html).toContain("<p>Конец</p>");
});

test("таблица в HTML-теле получает обёртку прокрутки .news-table", () => {
  const table = "<table><tr><th>Место</th></tr><tr><td>1</td></tr></table>";
  const body = sanitizeBody(`<p>До</p>${table}<p>После</p>`);
  const html = renderToStaticMarkup(<NewsBody body={body} />);
  expect(html).toContain(`<p>До</p><div class="news-table">${table}</div><p>После</p>`);
});

test("две таблицы — две обёртки", () => {
  const two = "<table><tr><td>1</td></tr></table><p>x</p><table><tr><td>2</td></tr></table>";
  expect(wrapTables(two)).toBe(
    '<div class="news-table"><table><tr><td>1</td></tr></table></div><p>x</p>' +
      '<div class="news-table"><table><tr><td>2</td></tr></table></div>',
  );
});

test("текст без таблиц обёрткой не трогается", () => {
  const body = "<p>Без таблиц</p><ul><li>раз</li></ul>";
  expect(wrapTables(body)).toBe(body);
  expect(renderToStaticMarkup(<NewsBody body={body} />)).not.toContain("news-table");
});
