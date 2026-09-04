import logoTransparentSrc from "@/assets/logo-transparent.png";

/**
 * Заглушка для фотографии персоны в разделе «Руководство».
 * Светло-голубой фон, обобщённый силуэт человека по центру,
 * логотип Федерации в правом нижнем углу как ненавязчивая вотермарка.
 */
export function PersonPhotoPlaceholder({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-news-card ${className ?? ""}`}
    >
      <svg
        viewBox="0 0 120 140"
        className="h-[55%] w-auto opacity-30"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M60 68c13.8 0 25-11.2 25-25S73.8 18 60 18 35 29.2 35 43s11.2 25 25 25z"
          fill="currentColor"
          className="text-news-card-foreground"
        />
        <path
          d="M60 78c-22.1 0-40 17.9-40 40v12h80v-12c0-22.1-17.9-40-40-40z"
          fill="currentColor"
          className="text-news-card-foreground"
        />
      </svg>

      <img
        src={logoTransparentSrc}
        alt=""
        loading="lazy"
        className="absolute right-3 bottom-3 h-8 w-auto opacity-20 md:h-10"
      />
    </div>
  );
}
