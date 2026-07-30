import { useEffect, useRef, useState } from "react";

type NewsImageProps = {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
};

/**
 * Изображение новости со skeleton-заглушкой на время загрузки.
 * Skeleton занимает всю область изображения и плавно исчезает после onLoad.
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
        className={`absolute inset-0 animate-pulse bg-brand-navy/10 transition-opacity duration-500 ${
          loaded ? "opacity-0" : "opacity-100"
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
        className={`${className} transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
