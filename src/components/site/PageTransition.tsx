import { useEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Плавное появление контента при смене маршрута + мягкая прокрутка вверх.
 * Никаких таймеров и задержек: анимация запускается сразу после монтирования
 * нового маршрута, загрузка данных не блокируется.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [pathname]);

  return (
    <div key={pathname} className="animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none">
      {children}
    </div>
  );
}
