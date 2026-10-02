import { useNavigate } from "@tanstack/react-router";
import { PREVIEW_STATES, previewWindowName, type NewsPreviewState } from "@/lib/news-preview";

/**
 * Полоса-пометка предпросмотра новости. Рисует её рама `_site.tsx`, а не
 * страница: `sticky` ограничена родителем, и только корень рамы тянется до
 * подвала — внутри обёртки `PageTransition` полоса уезжала бы, когда в окне
 * остаётся один подвал. `z-10` — выше содержимого (у обёртки `PageTransition`
 * постоянный `transform`, она позже в дереве), ниже выпадающего меню шапки
 * (40), поиска (30), полосы cookie (40) и лайтбокса (100, портал).
 *
 * На `lg` полоса в одну строку высотой 32 px: «Читайте также» на странице
 * новости — `lg:sticky lg:top-8`, полоса выше закрыла бы верх карточки.
 *
 * Цвета — токены бренда, роль «Пометка предпросмотра» (docs/style-rules.md,
 * «Поверхности»).
 */
export function NewsPreviewBar({ newsId, state }: { newsId: string; state: NewsPreviewState }) {
  const navigate = useNavigate();

  // Вкладку открыл редактор (имя окна — его) — закрыть её. Закрыть не дали
  // (вкладку открыли адресом или браузер отказал) — в редактор новости.
  // Проверяется итог `window.closed`, а не то, что `close()` был вызван.
  const onClose = () => {
    if (window.name === previewWindowName(newsId)) {
      window.close();
      if (window.closed) return;
    }
    void navigate({ to: "/admin/news/$id", params: { id: newsId } });
  };

  return (
    <div className="sticky top-0 z-10 bg-brand-orange text-brand-navy">
      <div className="mx-auto flex max-w-7xl lg:box-content flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1 md:px-6 lg:px-10">
        <p className="text-sm font-semibold">{PREVIEW_STATES[state].notice}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-brand-navy px-3 py-0.5 text-sm font-semibold text-brand-navy-foreground transition-colors hover:bg-brand-blue"
        >
          Закрыть предпросмотр
        </button>
      </div>
    </div>
  );
}
