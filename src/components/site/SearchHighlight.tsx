import type { FragmentSpan } from "@/lib/search-fragment";

/**
 * Рендер отрезков подсветки — обычные текстовые узлы React, без
 * `dangerouslySetInnerHTML`: запрос вида `<script>alert(1)</script>`
 * печатается буквально, безопасность — по построению, не по экранированию.
 */
export function SearchHighlight({ spans }: { spans: readonly FragmentSpan[] }) {
  return (
    <>
      {spans.map((span, index) =>
        span.highlighted ? (
          <mark key={index} className="rounded-sm bg-search-highlight px-0.5 text-inherit">
            {span.text}
          </mark>
        ) : (
          <span key={index}>{span.text}</span>
        ),
      )}
    </>
  );
}
