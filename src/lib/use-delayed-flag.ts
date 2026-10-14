import { useEffect, useRef, useState } from "react";

/**
 * Флаг с задержкой показа и минимальной длительностью: становится `true`, если
 * `active` продержался `delayMs`, и остаётся `true` не меньше `minMs` после
 * показа. Быстрое ожидание не даёт мелькания, показанная заглушка не исчезает
 * через кадр. На сервере и при гидрации — `false`: таймеры идут только в
 * эффектах.
 */
export function useDelayedFlag(active: boolean, delayMs: number, minMs: number): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (active && !shown) {
      const timer = window.setTimeout(() => {
        shownAt.current = performance.now();
        setShown(true);
      }, delayMs);
      return () => window.clearTimeout(timer);
    }
    if (!active && shown) {
      const rest = Math.max(0, minMs - (performance.now() - shownAt.current));
      const timer = window.setTimeout(() => setShown(false), rest);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [active, shown, delayMs, minMs]);

  return shown;
}
