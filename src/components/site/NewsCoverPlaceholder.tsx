import logoSrc from "@/assets/logo.png";

/**
 * Заглушка для новостей без изображения.
 * Используется только в карточках и списках — на странице новости обложка просто отсутствует.
 */
export function NewsCoverPlaceholder({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`flex h-full w-full items-center justify-center bg-news-card ${className ?? ""}`}
    >
      <img
        src={logoSrc}
        alt=""
        loading="lazy"
        className="h-[70%] max-h-full w-auto max-w-[70%] object-contain opacity-35 saturate-[0.35]"
      />
    </div>
  );
}
