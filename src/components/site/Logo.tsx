import logoSrc from "@/assets/logo.png.asset.json";

type LogoProps = {
  className?: string;
  /** Tailwind height classes, e.g. "h-16 md:h-20 lg:h-24" */
  sizeClassName?: string;
};

export function Logo({
  className,
  sizeClassName = "h-28 md:h-36 lg:h-48",
}: LogoProps) {
  return (
    <img
      src={logoSrc.url}
      alt="Федерация тенниса Санкт-Петербурга"
      className={`${sizeClassName} w-auto object-contain ${className ?? ""}`}
      loading="eager"
      decoding="async"
    />
  );
}
