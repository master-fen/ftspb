import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NewsBody } from "@/components/site/NewsBody";
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
