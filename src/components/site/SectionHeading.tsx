type SectionHeadingProps = {
  eyebrow: string;
  title: string;
};

export function SectionHeading({ eyebrow, title }: SectionHeadingProps) {
  return (
    <h2 className="flex items-center gap-3 text-3xl font-black tracking-tight text-foreground md:text-4xl">
      <span>{eyebrow}</span>
      <BallDivider />
      <span>{title}</span>
    </h2>
  );
}

function BallDivider() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0 md:h-7 md:w-7"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" fill="var(--color-brand-orange)" />
      <path
        d="M3 8 Q12 12 21 8 M3 16 Q12 12 21 16"
        stroke="oklch(0.15 0.03 250)"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}
