import { describe, expect, test } from "bun:test";
import {
  normalizeCreatePersonInput,
  normalizeUpdatePersonInput,
} from "@/lib/federation-person-input";

const valid = { fullName: "Иванов Иван Иванович", role: "Президент", position: 0 };

describe("normalizeCreatePersonInput", () => {
  test("пустой fullName отклоняется", () => {
    expect(() => normalizeCreatePersonInput({ ...valid, fullName: "" })).toThrow(
      "Поле «ФИО» обязательно",
    );
  });

  test("fullName из одних пробелов отклоняется", () => {
    expect(() => normalizeCreatePersonInput({ ...valid, fullName: "   \t " })).toThrow(
      "Поле «ФИО» обязательно",
    );
  });

  test("пустая role отклоняется", () => {
    expect(() => normalizeCreatePersonInput({ ...valid, role: " " })).toThrow(
      "Поле «Должность» обязательно",
    );
  });

  test("отрицательный position отклоняется", () => {
    expect(() => normalizeCreatePersonInput({ ...valid, position: -1 })).toThrow(
      "Поле «Порядок» должно быть целым неотрицательным числом",
    );
  });

  test("дробный position отклоняется", () => {
    expect(() => normalizeCreatePersonInput({ ...valid, position: 1.5 })).toThrow(
      "Поле «Порядок» должно быть целым неотрицательным числом",
    );
  });

  test('email "не-почта" отклоняется', () => {
    expect(() => normalizeCreatePersonInput({ ...valid, email: "не-почта" })).toThrow(
      "Некорректный email: не-почта",
    );
  });

  test("недопустимый статус отклоняется", () => {
    expect(() =>
      normalizeCreatePersonInput({ ...valid, status: "archived" as unknown as "draft" }),
    ).toThrow("Недопустимый статус: archived");
  });

  test('пустые строки в необязательных полях → null, не ""', () => {
    const out = normalizeCreatePersonInput({ ...valid, bio: "", phone: "  ", email: "" });
    expect(out.bio).toBeNull();
    expect(out.phone).toBeNull();
    expect(out.email).toBeNull();
  });

  test("значения обрезаются по trim, статус по умолчанию draft", () => {
    const out = normalizeCreatePersonInput({
      fullName: "  Петров Пётр  ",
      role: " Вице-президент ",
      email: " p@example.org ",
      phone: " +7 900 000-00-00 ",
      position: 3,
    });
    expect(out).toEqual({
      fullName: "Петров Пётр",
      role: "Вице-президент",
      bio: null,
      phone: "+7 900 000-00-00",
      email: "p@example.org",
      position: 3,
      status: "draft",
    });
  });
});

describe("normalizeUpdatePersonInput", () => {
  test("проверяет только присутствующие поля", () => {
    expect(normalizeUpdatePersonInput({})).toEqual({});
    expect(normalizeUpdatePersonInput({ role: " Президент " })).toEqual({ role: "Президент" });
  });

  test("присутствующее пустое fullName отклоняется", () => {
    expect(() => normalizeUpdatePersonInput({ fullName: "" })).toThrow("Поле «ФИО» обязательно");
  });

  test("email: пустая строка → null, мусор → ошибка", () => {
    expect(normalizeUpdatePersonInput({ email: "" })).toEqual({ email: null });
    expect(() => normalizeUpdatePersonInput({ email: "не-почта" })).toThrow(
      "Некорректный email: не-почта",
    );
  });

  test("отрицательный position отклоняется", () => {
    expect(() => normalizeUpdatePersonInput({ position: -5 })).toThrow(
      "Поле «Порядок» должно быть целым неотрицательным числом",
    );
  });
});
