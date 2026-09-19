import { fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

/**
 * Поле `?page=` схемы поиска: целое ≥ 1, иначе 1 (мусор, «0», «-3»);
 * отсутствует — 1. Парсер адреса роутера отдаёт числовые строки числами
 * (JSON.parse), нечисловые — строками; `fallback` ловит и то и другое, как
 * `?category=` на той же странице. Значение 1 вычищается из адреса
 * `stripSearchParams({ page: 1 })` в маршруте.
 *
 * Отдельный модуль от чистых помощников `news-paging.ts` намеренно: его
 * импортируют только маршруты (eager-часть роутера). Если бы zod-adapter
 * тянул и ленивый чанк компонента NewsPagination, сборка вынесла бы его в
 * общий чанк и добавила preload на каждую страницу сайта.
 */
export const pageSearchField = fallback(z.number().int().min(1), 1).default(1);
