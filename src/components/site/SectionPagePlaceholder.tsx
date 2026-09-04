export function SectionPagePlaceholder({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <article>
      <h1 className="text-3xl font-medium tracking-tight text-foreground md:text-4xl lg:text-5xl">
        {title}
      </h1>
      <p className="mt-3 font-ui text-[16px] leading-[19px] font-bold text-brand-orange">
        В разработке
      </p>
      {description ? (
        <p className="mt-5 max-w-2xl font-ui text-[16px] leading-[24px] text-muted-foreground">
          {description}
        </p>
      ) : null}
    </article>
  );
}
