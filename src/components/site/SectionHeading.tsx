import ballSrc from "@/assets/ball.png";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
};

export function SectionHeading({ eyebrow, title }: SectionHeadingProps) {
  return (
    <h2 className="flex items-center gap-3 text-3xl font-black tracking-tight text-foreground md:text-4xl">
      <span>{eyebrow}</span>
      <img
        src={ballSrc}
        alt=""
        aria-hidden
        className="h-6 w-6 shrink-0 object-contain md:h-8 md:w-8"
      />
      <span>{title}</span>
    </h2>
  );
}
