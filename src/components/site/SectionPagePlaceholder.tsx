import type { ReactNode } from "react";

export function SectionPagePlaceholder({
  title,
  description,
  afterStatus,
}: {
  title: string;
  description?: string;
  /** Между строкой «В разработке» и описанием — мобильная навигация раздела. */
  afterStatus?: ReactNode;
}) {
  return (
    <article>
      <h1 className="ui-h1">{title}</h1>
      <p className="mt-3 font-ui text-[16px] leading-[19px] font-bold text-brand-orange">
        В разработке
      </p>
      {afterStatus}
      {description ? (
        <p className="mt-5 max-w-2xl font-ui text-[16px] leading-[24px] text-muted-foreground">
          {description}
        </p>
      ) : null}
    </article>
  );
}
