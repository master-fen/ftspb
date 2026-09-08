import { Link, useMatch } from "@tanstack/react-router";
import { CharterToc } from "@/components/site/CharterToc";
import { DocumentFileCard } from "@/components/site/DocumentFileCard";

export function CharterPageAside() {
  // Aside рендерится из layout-а federation.tsx, а не из route устава,
  // поэтому loaderData доступна только через useMatch (route может быть
  // не смонтирован — тогда матча нет и файла нет).
  const match = useMatch({ from: "/federation/charter", shouldThrow: false });
  const documentFile = match?.loaderData ?? null;

  return (
    <div className="mt-5 space-y-5">
      <section
        aria-labelledby="charter-toc-title"
        className="rounded-[24px] border border-brand-blue/10 bg-background px-5 py-5 md:px-6"
      >
        <h2 id="charter-toc-title" className="text-xl font-medium text-foreground md:text-2xl">
          Содержание
        </h2>
        <CharterToc className="mt-3" />
      </section>

      <section
        aria-labelledby="charter-document-title"
        className="rounded-[24px] border border-brand-blue/10 bg-background px-5 py-5 md:px-6"
      >
        <h2 id="charter-document-title" className="text-xl font-medium text-foreground md:text-2xl">
          Документ
        </h2>
        <div className="mt-3">
          {documentFile ? (
            <DocumentFileCard
              label={documentFile.title}
              url={documentFile.url}
              sizeBytes={documentFile.sizeBytes}
              documentDate={documentFile.documentDate}
            />
          ) : (
            <p className="font-ui text-sm text-muted-foreground">PDF пока не опубликован</p>
          )}
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
