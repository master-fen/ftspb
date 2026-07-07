type LogoProps = {
  variant?: "light" | "dark";
  className?: string;
};

export function Logo({ variant = "light", className }: LogoProps) {
  const textColor =
    variant === "light" ? "text-brand-blue" : "text-brand-navy-foreground";

  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <div
        className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border"
        style={{ borderColor: "var(--color-brand-orange)" }}
        aria-hidden
      >
        <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none">
          <circle
            cx="20"
            cy="20"
            r="10"
            stroke="var(--color-brand-orange)"
            strokeWidth="2.5"
            fill="none"
          />
          <path
            d="M12 14 Q20 20 28 26"
            stroke="var(--color-brand-orange)"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M20 8 L22 4 L26 6 L24 3 L28 4 L26 1"
            stroke="var(--color-brand-orange)"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className={`text-[11px] leading-tight font-black tracking-wide uppercase ${textColor}`}>
        Федерация<br />тенниса<br />Санкт-Петербурга
      </div>
    </div>
  );
}
