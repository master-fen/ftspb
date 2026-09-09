import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/site/Breadcrumbs";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

type SectionFrameProps = {
  crumbs: Crumb[];
  /** Правая колонка: навигация раздела и всё, что под ней. */
  aside: ReactNode;
  children: ReactNode;
};

/**
 * Рама страницы раздела: шапка, хлебные крошки, сетка трёх равных колонок
 * (содержимое — две колонки слева, `aside` — одна справа; на узких экранах —
 * столбиком, содержимое первым), подвал. Раскладка раздела «Федерация»
 * (src/routes/federation.tsx) и страницы полного текста Устава
 * (src/routes/federation_.charter.text.tsx) рисуются этим компонентом.
 */
export function SectionFrame({ crumbs, aside, children }: SectionFrameProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16 lg:px-10">
        <Breadcrumbs items={crumbs} />

        <div className="flex flex-col gap-10 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
          <div className="min-w-0 lg:order-1 lg:col-span-2">{children}</div>
          <aside className="w-full lg:sticky lg:top-6 lg:order-2 lg:col-span-1 lg:flex lg:max-h-[calc(100vh-3rem)] lg:flex-col">
            {aside}
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
