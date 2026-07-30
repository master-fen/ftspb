import { useEffect, useRef, useState } from "react";

type NewsImageProps = {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
};

/**
 * Изображение новости со skeleton-заглушкой на время загрузки.
 * Skeleton занимает всю область изображения и плавно исчезает после загрузки,
 * само изображение проявляется через keyframe-анимацию (надёжнее CSS-transition,
 * который может не сработать на только что смонтированном элементе).
 */
export function NewsImage({ src, alt, className = "", loading = "lazy" }: NewsImageProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Изображение может быть уже в кэше (complete до навешивания onLoad)
  useEffect(() => {
    setLoaded(false);
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, [src]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-brand-navy/10 ${
          loaded ? "animate-out fade-out-0 fill-mode-forwards duration-700" : "animate-pulse"
        }`}
      />
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`${className} ${
          loaded ? "animate-in fade-in-0 duration-700 ease-out" : "opacity-0"
        }`}
      />
    </div>
  );
}
