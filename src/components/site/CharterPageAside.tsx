import { Download, FileText } from "lucide-react";
import { Link } from "@tanstack/react-router";

const charterSections = [
  { label: "Устав", href: "#charter-intro" },
  { label: "О документе", href: "#about-document" },
  { label: "Что регулирует устав", href: "#scope" },
  { label: "Основные положения", href: "#key-points" },
  { label: "Содержание устава", href: "#contents" },
  { label: "Полный текст документа", href: "#full-text" },
] as const;

export function CharterPageAside() {
  return (
    <div className="mt-5 space-y-5">
      <nav
        aria-label="Навигация по странице Устава"
        className="rounded-[24px] border border-brand-blue/10 bg-background px-5 py-5 md:px-6"
      >
        <h2 className="text-xl font-medium text-foreground md:text-2xl">На этой странице</h2>
        <ul className="mt-3 space-y-1">
          {charterSections.map((section) => (
            <li key={section.href}>
              <a
                href={section.href}
                className="block rounded-md py-1 font-ui text-[15px] leading-6 text-foreground/65 transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section
        aria-labelledby="charter-document-title"
        className="rounded-[24px] border border-brand-blue/10 bg-background px-5 py-5 md:px-6"
      >
        <h2 id="charter-document-title" className="text-xl font-medium text-foreground md:text-2xl">
          Документ
        </h2>
        <dl className="mt-3 space-y-2 font-ui text-[15px] leading-5">
          <div>
            <dt className="text-muted-foreground">Название</dt>
            <dd className="font-medium text-foreground">Устав Федерации</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Редакция</dt>
            <dd className="font-medium text-foreground">17 марта 2016</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Первоначально утверждён</dt>
            <dd className="font-medium text-foreground">22 апреля 2004</dd>
          </div>
        </dl>

        <div
          aria-label="Скачивание PDF будет доступно после публикации документа"
          className="mt-4 flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-muted-foreground"
        >
          <span className="flex min-w-0 items-center gap-2 font-ui text-sm font-semibold">
            <FileText className="size-4 shrink-0" aria-hidden="true" />
            PDF
          </span>
          <span className="flex items-center gap-1.5 font-ui text-sm">
            Скачать
            <Download className="size-4" aria-hidden="true" />
          </span>
        </div>

        <Link
          to="/federation/documents"
          className="mt-4 inline-flex font-ui text-sm font-medium text-brand-blue underline decoration-brand-blue/30 underline-offset-4 transition-colors hover:text-brand-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
        >
          Все документы Федерации
        </Link>
      </section>
    </div>
  );
}