/**
 * Постоянный адрес файла, приложенного к новости.
 *
 * Архивная новость ссылается на свои файлы прямо в тексте. Зашить в тело
 * адрес хранилища нельзя: он зависит от хостинга (перенос на аккаунт
 * Федерации — в отложенных решениях), и смена эндпоинта или бакета разом
 * сломала бы 1211 ссылок в боевой базе. Поэтому в теле стоит адрес сайта
 * `/news-file/СЛАГ/NN.ext`, а маршрут перенаправляет на текущий адрес
 * объекта в хранилище.
 *
 * Модуль чистый: ни базы, ни S3, ни переменных окружения. Им пользуются двое
 * — мигратор архива (строит адрес при замене меток) и маршрут сайта
 * (разбирает адрес обратно в ключ хранилища). Одна пара функций на обоих:
 * второй реализации правила быть не должно.
 */

/** Префикс маршрута. Менять его — значит сломать уже залитые тела. */
export const NEWS_FILE_PREFIX = "/news-file";

/** Префикс ключей файлов новости в хранилище (`scripts/migrate-archive.ts`). */
const NEWS_KEY_PREFIX = "news";

/** Папка документов внутри префикса новости. */
const DOCUMENTS_FOLDER = "documents";

/**
 * Слаг новости: латиница в нижнем регистре, цифры и одиночные дефисы между
 * ними — тот же набор, что даёт `slugify` (`src/server/slug.ts`).
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Слаги архива обрезаны до 60 знаков (`LEGACY_SLUG_MAX_LENGTH`), но у новости,
 * заведённой руками, слаг длиннее; предел взят с запасом.
 */
const SLUG_MAX_LENGTH = 200;

/** Имя файла документа: двузначный номер и расширение (`01.xls`). */
const FILE_PATTERN = /^\d{2}\.[a-z0-9]{1,8}$/;

/** Адрес файла новости на сайте. `fileName` — то, что даёт `documentFileName`. */
export function newsFileHref(slug: string, fileName: string): string {
  return `${NEWS_FILE_PREFIX}/${slug}/${fileName}`;
}

/**
 * Ключ объекта в хранилище по сегментам адреса — либо `null`, если сегменты
 * не той формы. Ключ **собирается** из двух проверенных сегментов, а не
 * берётся из запроса: вывести его за пределы `news/…/documents/` нельзя по
 * построению, а `..` и кодированные разделители не проходят регэкспы.
 */
export function newsFileKey(params: { slug: string; file: string }): string | null {
  const slug = params.slug;
  const file = params.file;
  if (slug.length === 0 || slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug)) {
    return null;
  }
  if (!FILE_PATTERN.test(file)) {
    return null;
  }
  return `${NEWS_KEY_PREFIX}/${slug}/${DOCUMENTS_FOLDER}/${file}`;
}

/**
 * Строка выборки: документ с таким ключом и одна из новостей, к которым он
 * привязан. Ключ — единственное условие выборки: слаг новости в него не
 * входит, потому что слаг можно сменить в админке, а ключи хранилища после
 * заливки не меняются. Искать по текущему слагу значило бы молча ломать все
 * ссылки на файлы в теле новости, у которой сменили адрес.
 */
export type NewsFileRow = {
  s3Key: string;
  documentPublished: boolean;
  documentDeleted: boolean;
  newsPublished: boolean;
  newsDeleted: boolean;
};

export type NewsFileVerdict = { ok: true; s3Key: string } | { ok: false; причина: string };

/**
 * Отдавать ли перенаправление. Перенаправление положено, когда документ с
 * этим ключом существует, не удалён и опубликован, и привязан хотя бы к одной
 * новости, которая опубликована и не удалена. Всё прочее — 404, а не ошибка
 * сервера: отсутствующий файл не авария.
 */
export function newsFileVerdict(rows: readonly NewsFileRow[]): NewsFileVerdict {
  if (rows.length === 0) {
    return { ok: false, причина: "файла новости с таким адресом нет" };
  }
  const живые = rows.filter(
    (r) => !r.documentDeleted && r.documentPublished && !r.newsDeleted && r.newsPublished,
  );
  if (живые.length === 0) {
    const r = rows[0];
    const причина = r.documentDeleted
      ? "документ удалён"
      : !r.documentPublished
        ? "документ не опубликован"
        : rows.every((x) => x.newsDeleted)
          ? "новость удалена"
          : "новость не опубликована";
    return { ok: false, причина };
  }
  return { ok: true, s3Key: живые[0].s3Key };
}
