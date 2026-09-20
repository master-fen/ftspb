import { describe, expect, test } from "bun:test";
import {
  JPEG_QUALITY,
  MAX_DIMENSION,
  collisions,
  decideAction,
  extensionOf,
  isImagePath,
  outputRelPath,
} from "./archive-image-rule";

describe("правило сжатия — зеркало админки", () => {
  test("константы совпадают с src/lib/image-resize.ts", () => {
    expect(MAX_DIMENSION).toBe(1600);
    // В админке качество задано долей 0.82, у sharp — процентами.
    expect(JPEG_QUALITY).toBe(82);
  });

  test("документ копируется как есть, расширение не меняется", () => {
    const action = decideAction("download\\docs\\polozhenie.pdf", null);
    expect(action).toBe("copy-document");
    expect(outputRelPath("download\\docs\\polozhenie.pdf", action)).toBe(
      "download\\docs\\polozhenie.pdf",
    );
  });

  test("GIF не трогается, даже если он больше предела", () => {
    const action = decideAction("download\\img\\banner.gif", {
      format: "gif",
      width: 4000,
      height: 3000,
    });
    expect(action).toBe("copy-gif");
    expect(outputRelPath("download\\img\\banner.gif", action)).toBe("download\\img\\banner.gif");
  });

  test("GIF, спрятанный под расширением .jpg, узнаётся по формату", () => {
    expect(
      decideAction("download\\img\\anim.jpg", { format: "gif", width: 4000, height: 10 }),
    ).toBe("copy-gif");
  });

  test("длинная сторона ровно на пределе — копия, а не перекодирование", () => {
    expect(
      decideAction("download\\img\\a.jpg", { format: "jpeg", width: 1600, height: 1200 }),
    ).toBe("copy-small");
    expect(
      decideAction("download\\img\\a.jpg", { format: "jpeg", width: 1200, height: 1600 }),
    ).toBe("copy-small");
  });

  test("на единицу больше предела — перекодирование", () => {
    expect(
      decideAction("download\\img\\a.jpg", { format: "jpeg", width: 1601, height: 1200 }),
    ).toBe("transform");
  });

  test("PNG больше предела перекодируется и получает .jpg", () => {
    const rel = "download\\img\\logo.png";
    const action = decideAction(rel, { format: "png", width: 3000, height: 2000 });
    expect(action).toBe("transform");
    expect(outputRelPath(rel, action)).toBe("download\\img\\logo.jpg");
  });

  test("PNG в пределах предела остаётся PNG", () => {
    const rel = "download\\img\\logo.png";
    const action = decideAction(rel, { format: "png", width: 300, height: 200 });
    expect(action).toBe("copy-small");
    expect(outputRelPath(rel, action)).toBe(rel);
  });

  test("изображение без метаданных — исключение, а не тихая копия", () => {
    expect(() => decideAction("download\\img\\a.jpg", null)).toThrow(/не переданы метаданные/);
  });

  test("изображение без размеров — исключение", () => {
    expect(() => decideAction("download\\img\\a.jpg", { format: "jpeg" })).toThrow(
      /не прочитались размеры/,
    );
  });

  test("файл без расширения при перекодировании получает .jpg в хвост", () => {
    expect(outputRelPath("download\\img\\noext", "transform")).toBe("download\\img\\noext.jpg");
  });

  test("точка в имени каталога расширением не считается", () => {
    expect(extensionOf("download\\v1.2\\photo")).toBe("");
    expect(extensionOf("download\\v1.2\\photo.JPG")).toBe(".jpg");
  });

  test("изображением считается то же, что у мигратора", () => {
    expect(isImagePath("a.jpg")).toBe(true);
    expect(isImagePath("a.JPEG")).toBe(true);
    expect(isImagePath("a.png")).toBe(true);
    expect(isImagePath("a.webp")).toBe(true);
    expect(isImagePath("a.gif")).toBe(true);
    expect(isImagePath("a.pdf")).toBe(false);
    expect(isImagePath("a.mov")).toBe(false);
  });

  test("смена расширения ловится как коллизия выходных имён", () => {
    const map = new Map([
      ["download\\img\\logo.png", "download\\img\\logo.jpg"],
      ["download\\img\\logo.jpg", "download\\img\\logo.jpg"],
      ["download\\img\\other.jpg", "download\\img\\other.jpg"],
    ]);
    const got = collisions(map);
    expect(got).toHaveLength(1);
    expect(got[0].sources).toEqual(["download\\img\\logo.jpg", "download\\img\\logo.png"]);
  });

  test("разные выходные имена коллизией не считаются", () => {
    const map = new Map([
      ["download\\img\\a.png", "download\\img\\a.jpg"],
      ["download\\img\\b.jpg", "download\\img\\b.jpg"],
    ]);
    expect(collisions(map)).toEqual([]);
  });

  test("Windows не различает регистр — A.jpg и a.jpg считаются одним файлом", () => {
    const map = new Map([
      ["download\\img\\A.PNG", "download\\img\\A.jpg"],
      ["download\\img\\a.jpg", "download\\img\\a.jpg"],
    ]);
    expect(collisions(map)).toHaveLength(1);
  });
});
