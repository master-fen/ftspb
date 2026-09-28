import { useEffect, useState } from "react";

/**
 * «К списку» на карточке новости/документа должен вести туда же, откуда
 * редактор пришёл — с теми же фильтрами и номером страницы, в том числе
 * после обновления страницы карточки (F5), которое не переживает обычная
 * история браузера. `/admin/_authed` рендерится на сервере (SSR не
 * отключён), поэтому `sessionStorage` читается и пишется только на клиенте,
 * в эффекте — иначе рассинхронизировалась бы гидратация. Пока значение не
 * прочитано или ключа нет (прямой заход на карточку по адресу), потребитель
 * получает `undefined` — ссылка ведёт на список с умолчаниями, как раньше.
 */

export function rememberListSearch(key: string, search: Record<string, unknown>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(search));
  } catch {
    // Приватное окно/заблокированный storage — не авария, просто не восстановится.
  }
}

export function useRestoredListSearch(key: string): Record<string, unknown> | undefined {
  const [search, setSearch] = useState<Record<string, unknown> | undefined>(undefined);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        setSearch(JSON.parse(raw) as Record<string, unknown>);
      }
    } catch {
      // См. rememberListSearch — та же причина, тот же результат: undefined.
    }
  }, [key]);

  return search;
}
