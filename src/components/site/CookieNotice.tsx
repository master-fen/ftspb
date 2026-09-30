import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "ftspb:cookie-notice-ack";

/**
 * Информационная полоса о cookie и Метрике. Метрика от нажатия не зависит.
 * Рендерится только в браузере после монтирования (SSR-разметка не меняется).
 * `sticky bottom-0` в конце рамы: пока страница длинная, полоса у нижнего края
 * окна; в конце страницы она уходит под подвал и не закрывает его строки.
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let acknowledged = false;
    try {
      acknowledged = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // localStorage недоступен (приватный режим, запрет) — полоса показывается.
    }
    if (!acknowledged) setVisible(true);
  }, []);

  if (!visible) return null;

  function acknowledge() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Не запомнилось — полоса всё равно закрывается до перезагрузки.
    }
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Уведомление о файлах cookie"
      className="sticky bottom-0 z-40 border-t border-border bg-card-surface text-foreground"
    >
      <div className="mx-auto flex max-w-7xl lg:box-content flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6 lg:px-10">
        <p className="text-sm">
          Сайт использует файлы cookie и Яндекс Метрику для подсчёта посещений. Подробнее — в{" "}
          <Link to="/privacy" hash="cookies" className="underline">
            политике конфиденциальности
          </Link>
          .
        </p>
        <Button type="button" onClick={acknowledge} className="shrink-0 self-start sm:self-auto">
          Понятно
        </Button>
      </div>
    </div>
  );
}
