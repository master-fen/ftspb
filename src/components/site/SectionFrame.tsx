import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/site/Breadcrumbs";

type SectionFrameProps = {
  crumbs: Crumb[];
  /** Правая колонка: навигация раздела и всё, что под ней. */
  aside: ReactNode;
  /**
   * Липкость правой колонки на lg. `"always"` (по умолчанию) — колонка липкая
   * и ограничена высотой окна на любом lg-экране; этого хватает там, где в
   * колонке стоит одна навигация раздела (~458px — помещается и в окно 665).
   * `"tall"` — то же самое, но только на окнах выше порога варианта `tall`
   * (src/styles.css); ниже порога колонка идёт в потоке страницы целиком.
   * Нужно там, где под навигацией стоит длинный блок: на низком окне ему в
   * липкой колонке места не остаётся и внутренняя прокрутка вырождается в щель.
   */
  stickyAside?: "always" | "tall";
  children: ReactNode;
};

/**
 * Две строки классов колонки — литеральные и выбираются ветвлением, а не
 * собираются из кусков: сканер Tailwind читает исходник как текст.
 * `lg:flex` тоже уходит под `tall` — иначе ниже порога колонка осталась бы
 * `display:flex` в направлении `row` и её содержимое встало бы в строку.
 */
const ASIDE_ALWAYS =
  "w-full lg:sticky lg:top-6 lg:order-2 lg:col-span-1 lg:flex lg:max-h-[calc(100vh-3rem)] lg:flex-col";
const ASIDE_TALL =
  "w-full lg:order-2 lg:col-span-1 lg:tall:sticky lg:tall:top-6 lg:tall:flex lg:tall:max-h-[calc(100vh-3rem)] lg:tall:flex-col";

/**
 * Раскладка страницы раздела: хлебные крошки, сетка трёх равных колонок
 * (содержимое — две колонки слева, `aside` — одна справа; на узких экранах —
 * столбиком, содержимое первым). Шапку, подвал и полную высоту страницы даёт
 * рама `_site` (src/routes/_site.tsx). Раскладка раздела «Федерация»
 * (src/routes/_site.federation.tsx), страница полного текста Устава
 * (src/routes/_site.federation_.charter.text.tsx) и страница события
 * (src/routes/_site.federation_.events.$slug.tsx) рисуются этим компонентом.
 */
export function SectionFrame({
  crumbs,
  aside,
  stickyAside = "always",
  children,
}: SectionFrameProps) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10">
      <Breadcrumbs items={crumbs} />

      <div className="flex flex-col gap-10 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
        <div className="min-w-0 lg:order-1 lg:col-span-2">{children}</div>
        <aside className={stickyAside === "tall" ? ASIDE_TALL : ASIDE_ALWAYS}>{aside}</aside>
      </div>
    </main>
  );
}
