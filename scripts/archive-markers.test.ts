import { describe, expect, test } from "bun:test";
import {
  DOCUMENT_MARKER_SCHEME,
  RECORD_MARKER_SCHEME,
  documentFileName,
  documentHrefsByPath,
  documentMarkerHref,
  findDocumentMarkerPaths,
  findMarkerSources,
  hasDocumentMarkerResidue,
  hasMarkerResidue,
  markerHref,
  replaceDocumentMarkers,
  replaceMarkers,
  slugMapBySource,
} from "./archive-markers.ts";

const SRC_A = "https://www.tennisfed.spb.ru/2023/0625";
const SRC_B = "https://www.tennisfed.spb.ru/2023/0624";
const SRC_MISSING = "https://www.tennisfed.spb.ru/2023/9999";

const map = new Map([
  [SRC_A, "festivalnye-rasskazy"],
  [SRC_B, "fest-etap-24-iyunya"],
]);

const anchor = (source: string, text: string) => `<a href="${markerHref(source)}">${text}</a>`;

describe("replaceMarkers", () => {
  test("метка заменяется на адрес записи", () => {
    const body = `<p>Отчёт — ${anchor(SRC_A, "на отдельной странице")}.</p>`;
    const r = replaceMarkers(body, map);
    expect(r.html).toBe(
      '<p>Отчёт — <a href="/news/festivalnye-rasskazy">на отдельной странице</a>.</p>',
    );
    expect(r.replaced).toBe(1);
    expect(r.dropped).toEqual([]);
    expect(hasMarkerResidue(r.html)).toBe(false);
  });

  test("две метки в одном теле заменяются обе", () => {
    const body = `<p>${anchor(SRC_A, "первая")} и ${anchor(SRC_B, "вторая")}</p>`;
    const r = replaceMarkers(body, map);
    expect(r.html).toBe(
      '<p><a href="/news/festivalnye-rasskazy">первая</a> и' +
        ' <a href="/news/fest-etap-24-iyunya">вторая</a></p>',
    );
    expect(r.replaced).toBe(2);
    expect(r.dropped).toEqual([]);
    expect(hasMarkerResidue(r.html)).toBe(false);
  });

  test("метка на отсутствующую запись становится обычным текстом", () => {
    const body = `<p>до ${anchor(SRC_MISSING, "видимый текст")} после</p>`;
    const r = replaceMarkers(body, map);
    expect(r.html).toBe("<p>до видимый текст после</p>");
    expect(r.replaced).toBe(0);
    expect(r.dropped).toEqual([SRC_MISSING]);
    expect(hasMarkerResidue(r.html)).toBe(false);
  });

  test("тело без меток не меняется", () => {
    const body =
      '<p>Обычный текст с <a href="http://tennisfed.spb.ru/2023/0625">внутренней ссылкой</a>' +
      ' и <a href="https://example.com/">внешней</a>.</p>';
    const r = replaceMarkers(body, map);
    expect(r.html).toBe(body);
    expect(r.replaced).toBe(0);
    expect(r.dropped).toEqual([]);
  });

  test("метка с текстом-разметкой внутри сохраняет разметку", () => {
    const body = `<p>${anchor(SRC_A, "<strong>жирный</strong> текст")}</p>`;
    const r = replaceMarkers(body, map);
    expect(r.html).toBe(
      '<p><a href="/news/festivalnye-rasskazy"><strong>жирный</strong> текст</a></p>',
    );
    expect(r.replaced).toBe(1);
  });
});

describe("остаток схемы", () => {
  test("hasMarkerResidue ловит незаменённую метку", () => {
    // Форма метки разошлась с формой замены: href в одинарных кавычках.
    const broken = `<p><a href='${markerHref(SRC_A)}'>текст</a></p>`;
    const r = replaceMarkers(broken, map);
    expect(r.replaced).toBe(0);
    expect(hasMarkerResidue(r.html)).toBe(true);
  });

  test("hasMarkerResidue не срабатывает на чистом теле", () => {
    expect(hasMarkerResidue("<p>Архив, запись, ссылка — и ни одной метки.</p>")).toBe(false);
  });
});

describe("slugMapBySource", () => {
  const sources = [SRC_A, SRC_B, undefined, SRC_MISSING];
  const slugs = ["festivalnye-rasskazy", "fest-etap-24-iyunya", "iz-lenty", "tretya-stranica"];

  test("карта по полному списку разрешает метку на запись за пределом среза", () => {
    const full = slugMapBySource(sources, slugs);
    const body = `<p>${anchor(SRC_MISSING, "дальняя запись")}</p>`;
    const r = replaceMarkers(body, full);
    expect(r.replaced).toBe(1);
    expect(r.html).toBe('<p><a href="/news/tretya-stranica">дальняя запись</a></p>');
  });

  test("карта по срезу теряет её — метка молча стала бы текстом", () => {
    const sliced = slugMapBySource(sources.slice(0, 2), slugs.slice(0, 2));
    const body = `<p>${anchor(SRC_MISSING, "дальняя запись")}</p>`;
    const r = replaceMarkers(body, sliced);
    expect(r.replaced).toBe(0);
    expect(r.dropped).toEqual([SRC_MISSING]);
    expect(r.html).toBe("<p>дальняя запись</p>");
  });

  test("запись без Источника в карту не попадает", () => {
    expect(slugMapBySource(sources, slugs).size).toBe(3);
  });
});

describe("findMarkerSources", () => {
  test("перечисляет источники в порядке появления, с повторами", () => {
    const body = `<p>${anchor(SRC_B, "раз")} ${anchor(SRC_A, "два")} ${anchor(SRC_B, "три")}</p>`;
    expect(findMarkerSources(body)).toEqual([SRC_B, SRC_A, SRC_B]);
  });

  test("markerHref строит href из схемы и источника", () => {
    expect(markerHref(SRC_A)).toBe(`${RECORD_MARKER_SCHEME}${SRC_A}`);
  });
});

// ───────────────────── метка на приложенный документ ─────────────────────

const DOC_A = "download\\news\\2013\\setki.xls";
const DOC_B = "download\\news\\2013\\polozhenie.pdf";
const DOC_MISSING = "download\\news\\2013\\net-takogo.doc";

/** Адрес файла новости — так его строит мигратор (src/lib/news-file-url.ts). */
const href = (fileName: string) => `/news-file/perehodyaschiy-kubok/${fileName}`;
const docMap = documentHrefsByPath([DOC_A, DOC_B], href);
const docAnchor = (path: string, text: string) =>
  `<a href="${documentMarkerHref(path)}">${text}</a>`;

describe("documentFileName", () => {
  test("номер двузначный с единицы, расширение из пути и в нижнем регистре", () => {
    expect(documentFileName(DOC_A, 0)).toBe("01.xls");
    expect(documentFileName(DOC_B, 1)).toBe("02.pdf");
    expect(documentFileName("a/B.PDF", 9)).toBe("10.pdf");
  });

  test("путь без расширения даёт голый номер", () => {
    expect(documentFileName("download/news/readme", 0)).toBe("01");
  });
});

describe("documentHrefsByPath", () => {
  test("карта строится по полю Документы записи, номера идут по порядку", () => {
    expect([...docMap]).toEqual([
      [DOC_A, "/news-file/perehodyaschiy-kubok/01.xls"],
      [DOC_B, "/news-file/perehodyaschiy-kubok/02.pdf"],
    ]);
  });

  test("документа чужой записи в карте нет — метка на него не разрешится", () => {
    expect(docMap.has(DOC_MISSING)).toBe(false);
  });
});

describe("replaceDocumentMarkers", () => {
  test("метка разрешается в адрес файла", () => {
    const body = `<p>Смотрите ${docAnchor(DOC_A, "ТУРНИРНЫЕ СЕТКИ")}.</p>`;
    const r = replaceDocumentMarkers(body, docMap);
    expect(r.html).toBe(
      '<p>Смотрите <a href="/news-file/perehodyaschiy-kubok/01.xls">ТУРНИРНЫЕ СЕТКИ</a>.</p>',
    );
    expect(r.replaced).toBe(1);
    expect(r.dropped).toEqual([]);
    expect(hasDocumentMarkerResidue(r.html)).toBe(false);
  });

  test("две метки в одном теле заменяются обе", () => {
    const body = `<p>${docAnchor(DOC_A, "сетки")} и ${docAnchor(DOC_B, "положение")}</p>`;
    const r = replaceDocumentMarkers(body, docMap);
    expect(r.html).toBe(
      '<p><a href="/news-file/perehodyaschiy-kubok/01.xls">сетки</a> и ' +
        '<a href="/news-file/perehodyaschiy-kubok/02.pdf">положение</a></p>',
    );
    expect(r.replaced).toBe(2);
    expect(hasDocumentMarkerResidue(r.html)).toBe(false);
  });

  test("метка на отсутствующий документ становится обычным текстом", () => {
    const body = `<p>до ${docAnchor(DOC_MISSING, "видимый текст")} после</p>`;
    const r = replaceDocumentMarkers(body, docMap);
    expect(r.html).toBe("<p>до видимый текст после</p>");
    expect(r.replaced).toBe(0);
    expect(r.dropped).toEqual([DOC_MISSING]);
    expect(hasDocumentMarkerResidue(r.html)).toBe(false);
  });

  test("тело без меток не меняется", () => {
    const body = '<p>Обычный текст и <a href="https://example.com/a.pdf">внешний файл</a>.</p>';
    const r = replaceDocumentMarkers(body, docMap);
    expect(r.html).toBe(body);
    expect(r.replaced).toBe(0);
    expect(r.dropped).toEqual([]);
  });

  test("метка с разметкой внутри сохраняет разметку", () => {
    const body = `<p>${docAnchor(DOC_A, "<b>СЕТКИ</b> турнира")}</p>`;
    const r = replaceDocumentMarkers(body, docMap);
    expect(r.html).toBe(
      '<p><a href="/news-file/perehodyaschiy-kubok/01.xls"><b>СЕТКИ</b> турнира</a></p>',
    );
  });

  test("метка записи и метка документа в одном теле не мешают друг другу", () => {
    const body = `<p>${anchor(SRC_A, "отчёт")} и ${docAnchor(DOC_A, "сетки")}</p>`;
    const шаг1 = replaceMarkers(body, map);
    const шаг2 = replaceDocumentMarkers(шаг1.html, docMap);
    expect(шаг1.replaced).toBe(1);
    expect(шаг2.replaced).toBe(1);
    expect(шаг2.html).toBe(
      '<p><a href="/news/festivalnye-rasskazy">отчёт</a> и ' +
        '<a href="/news-file/perehodyaschiy-kubok/01.xls">сетки</a></p>',
    );
    expect(hasMarkerResidue(шаг2.html)).toBe(false);
    expect(hasDocumentMarkerResidue(шаг2.html)).toBe(false);
  });
});

describe("остаток схемы метки документа", () => {
  test("hasDocumentMarkerResidue ловит незаменённую метку", () => {
    // Форма метки разошлась с формой замены: href в одинарных кавычках.
    const broken = `<p><a href='${documentMarkerHref(DOC_A)}'>текст</a></p>`;
    const r = replaceDocumentMarkers(broken, docMap);
    expect(r.replaced).toBe(0);
    expect(hasDocumentMarkerResidue(r.html)).toBe(true);
  });

  test("hasDocumentMarkerResidue не срабатывает на чистом теле", () => {
    expect(hasDocumentMarkerResidue("<p>обычное тело</p>")).toBe(false);
    expect(DOCUMENT_MARKER_SCHEME).toBe("archive-document:");
  });
});

describe("findDocumentMarkerPaths", () => {
  test("перечисляет пути в порядке появления, с повторами", () => {
    const body = `<p>${docAnchor(DOC_B, "п")} ${docAnchor(DOC_A, "с")} ${docAnchor(DOC_B, "ещё")}</p>`;
    expect(findDocumentMarkerPaths(body)).toEqual([DOC_B, DOC_A, DOC_B]);
  });

  test("метки записей в список документов не попадают", () => {
    expect(findDocumentMarkerPaths(anchor(SRC_A, "отчёт"))).toEqual([]);
    expect(findMarkerSources(docAnchor(DOC_A, "сетки"))).toEqual([]);
  });
});
