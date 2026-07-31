import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Единая плавная анимация появления новой страницы.
 * Ключ берётся из последнего фактически отрисованного match, а не из location:
 * location меняется в момент клика, когда Outlet ещё может содержать предыдущую
 * страницу. Это не позволяет старой странице повторно смонтироваться и мигнуть.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const renderedPathname = useRouterState({
    select: (state) => state.matches.at(-1)?.pathname ?? state.location.pathname,
  });
  const previousPathname = useRef(renderedPathname);

  useLayoutEffect(() => {
    if (renderedPathname === previousPathname.current) return;

    previousPathname.current = renderedPathname;
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [renderedPathname]);

  return (
    <div
      key={renderedPathname}
      className="motion-safe:animate-page-in [backface-visibility:hidden] [transform:translateZ(0)]"
    >
      {children}
    </div>
  );
}
