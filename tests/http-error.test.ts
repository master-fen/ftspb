import { describe, expect, test } from "bun:test";
import { HttpError } from "@/lib/http-error";

describe("HttpError", () => {
  test("несёт статус и сообщение, остаётся Error", () => {
    const error = new HttpError(404, "Новость не найдена: x");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(404);
    expect(error.message).toBe("Новость не найдена: x");
    expect(error.name).toBe("HttpError");
  });

  test("обычный Error не является HttpError", () => {
    const error: unknown = new Error("Не удалось подобрать уникальный ключ файла");
    expect(error instanceof HttpError).toBe(false);
  });
});
