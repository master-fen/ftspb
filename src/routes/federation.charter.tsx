import { createFileRoute } from "@tanstack/react-router";
import { CharterText } from "@/components/site/CharterText";
import { CharterToc } from "@/components/site/CharterToc";
import { DocumentFileCard } from "@/components/site/DocumentFileCard";
import { charterContent } from "@/lib/charter/content";
import { CHARTER_DOCUMENT_SLUG, CHARTER_META } from "@/lib/charter/meta";
import { getPublishedDocumentBySlug } from "@/lib/documents-server-fn";

const TITLE = "Устав — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Устав Санкт-Петербургской Региональной общественной организации «Спортивная Федерация тенниса» в редакции от 17 марта 2016 года: полный текст и файл PDF.";

export const Route = createFileRoute("/federation/charter")({
  loader: () => getPublishedDocumentBySlug({ data: CHARTER_DOCUMENT_SLUG }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: CharterPage,
});

function CharterPage() {
  const documentFile = Route.useLoaderData();

  return (
    // Юридический текст: 16px, межстрочный интервал не меньше 1.55,
    // text-foreground без прозрачности — ради контраста.
    <article className="max-w-3xl font-ui text-base leading-[1.6] text-foreground">
      <h1 className="font-sans text-3xl font-medium tracking-tight text-foreground md:text-4xl lg:text-5xl">
        Устав
      </h1>

      <p className="mt-5">
        Устав — учредительный документ Санкт-Петербургской Региональной общественной организации
        «Спортивная Федерация тенниса». Ниже приведён полный текст в редакции, утверждённой Общим
        собранием членов 17 марта 2016 года; файл в формате PDF доступен для скачивания.
      </p>

      <section aria-labelledby="charter-requisites-title" className="mt-8">
        <h2
          id="charter-requisites-title"
          className="font-sans text-2xl font-medium text-foreground"
        >
          Реквизиты
        </h2>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="font-semibold">Полное наименование организации</dt>
            <dd className="mt-0.5">{CHARTER_META.fullName}</dd>
          </div>
          <div>
            <dt className="font-semibold">Сокращённое наименование</dt>
            <dd className="mt-0.5">{CHARTER_META.shortName}</dd>
          </div>
          <div>
            <dt className="font-semibold">Редакция</dt>
            <dd className="mt-0.5">
              утверждена {CHARTER_META.editionApprovedBy} от{" "}
              <time dateTime={CHARTER_META.editionDate}>{CHARTER_META.editionDateText}</time>
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Первоначальная редакция</dt>
            <dd className="mt-0.5">
              утверждена {CHARTER_META.originalApprovedBy} от{" "}
              <time dateTime={CHARTER_META.originalDate}>{CHARTER_META.originalDateText}</time>
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Государственная регистрация Федерации</dt>
            <dd className="mt-0.5">
              <time dateTime={CHARTER_META.registrationDate}>
                {CHARTER_META.registrationDateText}
              </time>
              , ОГРН {CHARTER_META.ogrn}
            </dd>
          </div>
          <div className="lg:hidden">
            <dt className="font-semibold">Файл</dt>
            <dd className="mt-1.5">
              {documentFile ? (
                <DocumentFileCard
                  label={documentFile.title}
                  url={documentFile.url}
                  sizeBytes={documentFile.sizeBytes}
                  documentDate={documentFile.documentDate}
                />
              ) : (
                <span className="text-muted-foreground">PDF пока не опубликован</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* На телефоне боковая колонка уезжает под текст — дублируем оглавление здесь. */}
      <CharterToc className="mt-8 lg:hidden" />

      <p className="mt-8 text-foreground/80">
        Текст приводится для ознакомления. При расхождениях приоритет имеет документ в формате PDF.
      </p>

      <CharterText content={charterContent} />
    </article>
  );
}
