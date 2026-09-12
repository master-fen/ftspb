import { Link } from "@tanstack/react-router";
import { NewsCoverPlaceholder } from "@/components/site/NewsCoverPlaceholder";

const linkClass = "font-ui text-[16px] font-bold leading-[19.25px] text-brand-blue ui-link";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16 xl:px-10">
      <h1 className="text-center ui-h1">{title}</h1>
      <p className="mt-3 text-center font-ui text-[16px] font-bold leading-[19.25px] text-brand-orange">
        В разработке
      </p>

      {description && (
        <p className="mt-6 text-center font-ui text-[16px] leading-[24px] text-muted-foreground">
          {description}
        </p>
      )}

      <div className="mx-auto mt-8 h-40 w-full max-w-md md:h-56">
        <NewsCoverPlaceholder withBackground={false} />
      </div>

      <div className="mt-10 flex flex-col items-center gap-4">
        <h2 className="text-center ui-h2">Посмотреть готовые разделы</h2>
        <nav className="flex flex-col items-center gap-3">
          <Link to="/" className={linkClass}>
            Главная страница
          </Link>
          <Link to="/news" className={linkClass}>
            Новости
          </Link>
        </nav>
      </div>
    </main>
  );
}
