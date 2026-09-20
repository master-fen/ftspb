import { describe, expect, test } from "bun:test";
import {
  RECORD_MARKER_SCHEME,
  findMarkerSources,
  hasMarkerResidue,
  markerHref,
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
