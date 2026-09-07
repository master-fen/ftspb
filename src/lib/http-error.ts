/**
 * Ошибка с HTTP-статусом. Роут (`src/routes/api/admin/upload.ts`) берёт код
 * ответа из `status`, а не из текста сообщения — текст остаётся для
 * пользователя админки и может меняться, не меняя код ответа.
 *
 * Один класс, статус параметром; иерархии подклассов нет намеренно.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
