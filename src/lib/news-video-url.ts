/**
 * Ссылка на видео Kinescope у новости — валидация и нормализация.
 *
 * Чистый модуль без БД и сети: его вызывает src/server/news-admin.ts перед
 * insert/update (серверная граница — эндпоинт вызывается по HTTP напрямую) и
 * форма src/routes/admin/_authed/news.$id.tsx для подсказки у поля;
 * tests/news-video-url.test.ts проверяет правила отдельно от RPC.
 *
 * Пустая строка сюда не попадает — «видео нет» обрабатывает вызывающий код
 * ("" → null). Любой принятый адрес приводится к одному виду:
 * https://kinescope.io/embed/<ID>, query и hash отбрасываются.
 */

/** Единственные допустимые хосты; сравнение на равенство, не на суффикс. */
export const KINESCOPE_HOSTS = ["kinescope.io", "www.kinescope.io"] as const;

/** Путь /embed/ID или /ID, конечный слэш допустим; ID — [A-Za-z0-9]{1,64}. */
const EMBED_PATH_RE = /^\/embed\/([A-Za-z0-9]{1,64})\/?$/;
const SHORT_PATH_RE = /^\/([A-Za-z0-9]{1,64})\/?$/;

/**
 * Одна необязательная группа `(?:embed\/)?` здесь не годится: «/embed/» и
 * «/embed» прошли бы как ID = "embed". Поэтому две регулярки, и слово
 * `embed` единственным сегментом — не ID.
 */
function extractVideoId(pathname: string): string | null {
  const embed = EMBED_PATH_RE.exec(pathname);
  if (embed) return embed[1];
  const short = SHORT_PATH_RE.exec(pathname);
  if (short && short[1] !== "embed") return short[1];
  return null;
}

export type NormalizeVideoUrlResult = { ok: true; url: string } | { ok: false; message: string };

export function normalizeVideoUrl(input: string): NormalizeVideoUrlResult {
  const trimmed = input.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, message: "Некорректная ссылка" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Ссылка должна начинаться с http:// или https://" };
  }

  // `host` включает порт — адрес с нестандартным портом тоже отказ.
  if (!(KINESCOPE_HOSTS as readonly string[]).includes(url.host)) {
    return { ok: false, message: "Поддерживаются только ссылки на kinescope.io" };
  }

  const id = extractVideoId(url.pathname);
  if (id === null) {
    return {
      ok: false,
      message:
        "Ссылка должна вести на видео: https://kinescope.io/ID или https://kinescope.io/embed/ID",
    };
  }

  return { ok: true, url: `https://kinescope.io/embed/${id}` };
}
