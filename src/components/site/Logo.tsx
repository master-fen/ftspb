import logoSrc from "@/assets/logo.png";

type LogoProps = {
  className?: string;
  /** Tailwind height classes, e.g. "h-16 md:h-20 lg:h-24" */
  sizeClassName?: string;
};

export function Logo({
  className,
  sizeClassName = "h-20 md:h-28 lg:h-40",
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
