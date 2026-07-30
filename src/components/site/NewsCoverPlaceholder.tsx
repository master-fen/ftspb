import logoTransparentSrc from "@/assets/logo-transparent.png";

/**
 * Заглушка для новостей без изображения и для разделов «в разработке».
 * withBackground={false} — логотип прямо на белом фоне страницы.
 */
export function NewsCoverPlaceholder({
  className,
  withBackground = true,
}: {
  className?: string;
  withBackground?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={`flex h-full w-full items-center justify-center ${withBackground ? "bg-news-card" : ""} ${className ?? ""}`}
    >
      <img
        src={logoTransparentSrc}
        alt=""
        loading="lazy"
        className="h-[70%] max-h-full w-auto max-w-[70%] object-contain opacity-35 saturate-[0.35]"
      />
    </div>
  );
}
