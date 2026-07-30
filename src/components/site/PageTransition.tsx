import { useLayoutEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Единая плавная анимация появления новой страницы.
 * Ключевые моменты:
 * - прокрутка вверх выполняется синхронно ДО первой отрисовки нового маршрута,
 *   поэтому старый контент не может «мигнуть» на прежней позиции;
 * - fade-in запускается на уже проскроллённом контенте — переход воспринимается
 *   как одно непрерывное движение, без скачков и мерцания;
 * - никаких таймеров и искусственных задержек: загрузка данных не блокируется.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [current, setCurrent] = useState(pathname);

  useLayoutEffect(() => {
    if (pathname === current) return;
    // Синхронно, до paint: новая страница сразу показывается сверху.
    window.scrollTo(0, 0);
    setCurrent(pathname);
  }, [pathname, current]);

  return (
    <div
      key={pathname}
      className="motion-safe:animate-page-in [backface-visibility:hidden] [transform:translateZ(0)]"
    >
      {children}
    </div>
  );
}
