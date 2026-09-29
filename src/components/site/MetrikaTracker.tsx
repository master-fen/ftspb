import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { METRIKA_COUNTER_ID, isProductionHost, isExcludedPath, pageKey } from "@/lib/analytics";

type Ym = ((...args: unknown[]) => void) & { a?: unknown[]; l?: number };

declare global {
  interface Window {
    ym?: Ym;
  }
}

const TAG_URL = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_COUNTER_ID}`;

/**
 * Загрузчик и инициализация — по официальному коду вставки из кабинета Метрики
 * (очередь `ym.a`, проверка повторной вставки). Параметры инициализации наши:
 * `defer: true` отключает автоматический хит, просмотры шлёт эффект ниже, по
 * одному на смену pathname/search (SPA-схема из справки Метрики). Без `ssr`,
 * Вебвизора, карты кликов и электронной коммерции; `trackLinks` включён.
 */
function loadMetrika(): void {
  const w = window;
  w.ym =
    w.ym ||
    function (...args: unknown[]) {
      (w.ym!.a = w.ym!.a || []).push(args);
    };
  w.ym.l = 1 * new Date().getTime();
  for (let i = 0; i < document.scripts.length; i++) {
    if (document.scripts[i].src === TAG_URL) return;
  }
  const script = document.createElement("script");
  script.async = true;
  script.src = TAG_URL;
  document.head.appendChild(script);
  w.ym(METRIKA_COUNTER_ID, "init", {
    defer: true,
    accurateTrackBounce: true,
    trackLinks: true,
    clickmap: false,
    webvisor: false,
    ecommerce: false,
  });
}

/**
 * Считает открытия публичных страниц в Яндекс Метрике. Ничего не рендерит:
 * SSR-разметка не меняется. Подписка — на pathname + search (без hash), по
 * разрешённой (`resolvedLocation`) локации: к этому моменту заголовок новой
 * страницы уже применён. В админке — ни загрузки, ни хитов.
 */
export function MetrikaTracker() {
  const key = useRouterState({
    select: (s) =>
      s.resolvedLocation
        ? pageKey(s.resolvedLocation.pathname, s.resolvedLocation.searchStr)
        : null,
  });
  const pathname = useRouterState({ select: (s) => s.resolvedLocation?.pathname ?? null });
  // Ключ последнего отправленного просмотра; null — после админки или до первого.
  const lastKey = useRef<string | null>(null);
  const isFirst = useRef(true);

  useEffect(() => {
    if (key === null || pathname === null) return;
    if (!isProductionHost(window.location.hostname)) return;
    if (isExcludedPath(pathname)) {
      lastKey.current = null;
      isFirst.current = false;
      return;
    }
    if (lastKey.current === key) return;
    loadMetrika();
    const referer = isFirst.current
      ? document.referrer
      : lastKey.current
        ? window.location.origin + lastKey.current
        : undefined;
    isFirst.current = false;
    lastKey.current = key;
    window.ym!(METRIKA_COUNTER_ID, "hit", window.location.origin + key, {
      title: document.title,
      referer,
    });
  }, [key, pathname]);

  return null;
}
