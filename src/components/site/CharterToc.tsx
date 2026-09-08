import { CHARTER_SECTION_TITLES } from "@/lib/charter/meta";

const sectionNumbers = Object.keys(CHARTER_SECTION_TITLES)
  .map(Number)
  .sort((a, b) => a - b);

/** Оглавление полного текста Устава: ссылки на разделы #razdel-N. */
export function CharterToc({ className }: { className?: string }) {
  return (
    <nav aria-label="Содержание Устава" className={className}>
      <ol className="space-y-1">
        {sectionNumbers.map((number) => (
          <li key={number}>
            <a
              href={`#razdel-${number}`}
              className="block rounded-md py-1 font-ui text-[15px] leading-6 text-foreground/65 transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              {number}. {CHARTER_SECTION_TITLES[number]}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
