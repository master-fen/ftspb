import { z } from "zod";

export const featuredNewsInput = z.object({
  ids: z
    .array(z.string().uuid())
    .max(3, "Можно выбрать не больше трёх новостей")
    .refine((ids) => new Set(ids).size === ids.length, "Новость не может занимать две позиции"),
  expected: z.string(),
});

export function featuredSignature(rows: { id: string; featuredOrder: number | null }[]): string {
  return JSON.stringify(
    rows
      .map((r) => [r.id, r.featuredOrder])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}
