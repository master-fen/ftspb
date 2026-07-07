import logoSrc from "@/assets/logo.png";

type LogoProps = {
  className?: string;
  /** Tailwind height classes, e.g. "h-16 md:h-20 lg:h-24" */
  sizeClassName?: string;
};

export function Logo({
  className,
  sizeClassName = "h-14 md:h-16 lg:h-20",
}: LogoProps) {
  return (
    <img
      src={logoSrc}
      alt="Федерация тенниса Санкт-Петербурга"
      className={`${sizeClassName} w-auto object-contain ${className ?? ""}`}
      loading="eager"
      decoding="async"
    />
  );
}
