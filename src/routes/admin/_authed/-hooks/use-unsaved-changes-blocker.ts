import { useEffect, useRef } from "react";
import { useBlocker } from "@tanstack/react-router";

export function useUnsavedChangesBlocker(hasUnsavedChanges: boolean, warnOnUnload = false) {
  const stateRef = useRef({ dirty: hasUnsavedChanges, bypass: false });
  stateRef.current.dirty = hasUnsavedChanges;

  // Страховка на случай, если navigate() после bypassNextNavigation() не
  // дошёл до проверки shouldBlockFn. Условная: срабатывает, только если
  // bypassNextNavigation() вызван вместе с изменением hasUnsavedChanges
  // (в обеих точках вызова — рядом с form.reset(...)). Без такого
  // изменения зависимость эффекта не сработает, и флаг снимется только на
  // следующей проверке shouldBlockFn — гарантию даёт reset рядом с
  // вызовом, а не сам этот эффект.
  useEffect(() => {
    stateRef.current.bypass = false;
  }, [hasUnsavedChanges]);

  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (stateRef.current.bypass) {
        stateRef.current.bypass = false;
        return false;
      }
      return stateRef.current.dirty;
    },
    enableBeforeUnload: warnOnUnload ? () => stateRef.current.dirty : false,
    withResolver: true,
  });

  return {
    ...blocker,
    bypassNextNavigation: () => {
      stateRef.current.bypass = true;
    },
  };
}
