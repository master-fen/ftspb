/**
 * Ссылки в теле записи на страницы старых фотогалерей (`photogallery_*.html`).
 *
 * Кадры такой страницы переезжают в галерею записи-адресата, и ссылка на
 * страницу после переезда мертва. Ссылка в теле адресата — снимается целиком
 * (с видимым текстом), ссылка в теле другой записи — переписывается на метку
 * `archive-record:` адресата (правило решения 02.09.2026: страница, ставшая
 * записью, адресуется адресом записи).
 *
 * Модуль без зависимостей: его делят `node` (parse-archive.ts) и `bun`.
 */

const SITE = "https?://(?:www\\.)?tennisfed\\.spb\\.ru";
/** Серия пробелов и `<br>`, остающаяся вокруг снятой ссылки. */
const RUN = "(?:\\s|<br>)*";

function linkRe(page: string, flags: string): RegExp {
  const esc = page.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<a\\s[^>]*href="${SITE}/${esc}"[^>]*>([\\s\\S]*?)</a>`, flags);
}

/** Сколько ссылок на страницу в теле (адрес сравнивается целиком). */
export function countGalleryLinks(html: string, page: string): number {
  return [...html.matchAll(linkRe(page, "gi"))].length;
}

/**
 * Снять ссылки на страницу вместе с одним соседним разделителем `***` (левым,
 * иначе правым) и серией `<br>`/пробелов вокруг. Ссылка, стоявшая в начале
 * абзаца (после `<p>`/`<strong>`), уносит серию справа; в конце — серию
 * слева; посреди текста уносит серию справа, отступ слева остаётся прежним.
 * Абзац, в котором ничего не осталось, не публикуется. Работает по абзацам
 * (строкам тела), остальное не читает.
 */
export function removeGalleryLink(html: string, page: string): { html: string; removed: number } {
  const re = linkRe(page, "i");
  const sepLeft = new RegExp(`${RUN}\\*\\*\\*\\s*$`);
  const sepRight = /^\s*\*\*\*/;
  let removed = 0;
  const out: string[] = [];
  for (const block of html.split("\n")) {
    let cur = block;
    let dropBlock = false;
    for (let m = re.exec(cur); m; m = re.exec(cur)) {
      removed += 1;
      let left = cur.slice(0, m.index);
      let right = cur.slice(m.index + m[0].length);
      if (sepLeft.test(left)) left = left.replace(sepLeft, "");
      else if (sepRight.test(right)) right = right.replace(sepRight, "");
      const leftOpen = left.replace(new RegExp(`${RUN}$`), "");
      const rightAll = right.replace(new RegExp(`^${RUN}`), "");
      const rightBr = right.replace(/^(?:\s*<br>)+\s*/, "");
      const leftEmpty = /^(?:<p>)?(?:<(?:strong|b)>)*$/i.test(leftOpen);
      const rightEmpty = /^(?:<\/(?:strong|b)>)*(?:<\/p>)?$/i.test(rightAll);
      if (leftEmpty && rightEmpty) {
        dropBlock = true;
        break;
      }
      cur = leftEmpty || rightEmpty ? leftOpen + rightAll : left + rightBr;
    }
    if (!dropBlock) out.push(cur);
  }
  return { html: out.join("\n"), removed };
}

/** Переписать ссылки на страницу в метку `archive-record:ИСТОЧНИК`; текст остаётся. */
export function rewriteGalleryLink(
  html: string,
  page: string,
  source: string,
): { html: string; rewritten: number } {
  let rewritten = 0;
  const out = html.replace(linkRe(page, "gi"), (_whole, inner: string) => {
    rewritten += 1;
    return `<a href="archive-record:${source}">${inner}</a>`;
  });
  return { html: out, rewritten };
}
