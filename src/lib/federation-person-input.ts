import { z } from "zod";

/**
 * Серверная валидация и нормализация записи «Руководство» (federation_person).
 *
 * Чистый модуль без БД и сессии: его вызывает src/server/federation-person.ts
 * перед insert/update, а tests/federation-person-input.test.ts проверяет
 * правила отдельно от RPC. Zod-схемы в src/lib/federation-person-server-fn.ts
 * задают только форму payload; смысловые правила — здесь, в одном месте.
 *
 * Правила: fullName и role непусты после trim; position — целое ≥ 0; email,
 * если задан, проходит z.string().email(); phone и bio — произвольные строки.
 * Пустая строка в необязательном поле сохраняется как null, не как "".
 */

export type PersonStatus = "draft" | "published";

export type CreatePersonInput = {
  fullName: string;
  role: string;
  bio?: string | null;
  phone?: string | null;
  email?: string | null;
  position: number;
  status?: PersonStatus;
};

export type UpdatePersonInput = Partial<CreatePersonInput>;

export type NormalizedCreatePersonInput = {
  fullName: string;
  role: string;
  bio: string | null;
  phone: string | null;
  email: string | null;
  position: number;
  status: PersonStatus;
};

export type NormalizedUpdatePersonInput = Partial<NormalizedCreatePersonInput>;

const emailSchema = z.string().email();

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Поле «${label}» обязательно`);
  }
  return value.trim();
}

/** Необязательный текст: undefined/null/пустая строка → null, иначе trim. */
function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`Поле «${label}» должно быть строкой`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function optionalEmail(value: unknown): string | null {
  const text = optionalText(value, "Email");
  if (text === null) return null;
  if (!emailSchema.safeParse(text).success) {
    throw new Error(`Некорректный email: ${text}`);
  }
  return text;
}

function position(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("Поле «Порядок» должно быть целым неотрицательным числом");
  }
  return value;
}

function status(value: unknown): PersonStatus {
  if (value !== "draft" && value !== "published") {
    throw new Error(`Недопустимый статус: ${String(value)}`);
  }
  return value;
}

export function normalizeCreatePersonInput(input: CreatePersonInput): NormalizedCreatePersonInput {
  return {
    fullName: requiredText(input.fullName, "ФИО"),
    role: requiredText(input.role, "Должность"),
    bio: optionalText(input.bio, "Биография"),
    phone: optionalText(input.phone, "Телефон"),
    email: optionalEmail(input.email),
    position: position(input.position),
    status: input.status === undefined ? "draft" : status(input.status),
  };
}

/** Те же правила, но только для присутствующих (`!== undefined`) полей. */
export function normalizeUpdatePersonInput(input: UpdatePersonInput): NormalizedUpdatePersonInput {
  const out: NormalizedUpdatePersonInput = {};
  if (input.fullName !== undefined) out.fullName = requiredText(input.fullName, "ФИО");
  if (input.role !== undefined) out.role = requiredText(input.role, "Должность");
  if (input.bio !== undefined) out.bio = optionalText(input.bio, "Биография");
  if (input.phone !== undefined) out.phone = optionalText(input.phone, "Телефон");
  if (input.email !== undefined) out.email = optionalEmail(input.email);
  if (input.position !== undefined) out.position = position(input.position);
  if (input.status !== undefined) out.status = status(input.status);
  return out;
}
