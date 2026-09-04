import { Link } from "@tanstack/react-router";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Хлебные крошки"
      className="mb-4 flex h-8 flex-wrap items-center gap-3 text-sm leading-8 font-medium text-foreground/40 md:mb-5"
    >
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-3">
          {i > 0 ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full bg-foreground/15"
              aria-hidden="true"
            />
          ) : null}
          {item.href ? (
            <Link to={item.href} className="transition-colors hover:text-foreground">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
