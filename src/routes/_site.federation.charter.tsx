import { createFileRoute } from "@tanstack/react-router";
import { CharterToc } from "@/components/site/CharterToc";
import { DocumentFileRow } from "@/components/site/DocumentFileRow";
import { CHARTER_DOCUMENT_SLUG, CHARTER_META, CHARTER_TEXT_PATH } from "@/lib/charter/meta";
import { getPublishedDocumentBySlug } from "@/lib/documents-server-fn";
import { formatIsoDateRu } from "@/lib/format-iso-date";

const TITLE = "Устав — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Устав Санкт-Петербургской Региональной общественной организации «Спортивная Федерация тенниса»: редакция от 17 марта 2016 года, полный текст и файл PDF.";

export const Route = createFileRoute("/_site/federation/charter")({
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

/**
 * Витрина Устава: описание, реквизиты редакций, содержание со ссылками на
 * страницу полного текста (/federation/charter/text) и строки файлов.
 * Сам текст здесь не рендерится.
 */
function CharterPage() {
  const documentFile = Route.useLoaderData();

  return (
    <article className="max-w-3xl font-ui text-base leading-[1.6] text-foreground">
      <h1 className="font-sans text-3xl font-medium tracking-tight text-foreground md:text-4xl lg:text-5xl">
        Устав
      </h1>

      <p className="mt-5">
        Устав — учредительный документ Санкт-Петербургской Региональной общественной организации
        «Спортивная Федерация тенниса». На сайте доступны полный текст в редакции, утверждённой
        Общим собранием членов 17 марта 2016 года, и файл в формате PDF.
      </p>

      <section aria-labelledby="charter-about-title" className="mt-8">
        <h2 id="charter-about-title" className="font-sans text-2xl font-medium text-foreground">
          О документе
        </h2>
        <dl className="mt-3 space-y-3">
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
        </dl>
      </section>

      <section aria-labelledby="charter-scope-title" className="mt-8">
        <h2 id="charter-scope-title" className="font-sans text-2xl font-medium text-foreground">
          Что регулирует Устав
        </h2>
        <p className="mt-3">
          Устав закрепляет цели, задачи и виды деятельности Федерации, её права и обязанности,
          условия членства, устройство и полномочия руководящих и ревизионных органов, порядок
          формирования имущества и ведения предпринимательской деятельности, символику, порядок
          внесения изменений, реорганизации и ликвидации.
        </p>
        <h3 className="mt-6 font-sans text-xl font-medium text-foreground">Содержание</h3>
        {/* Каждый пункт ведёт в раздел полного текста на отдельной странице. */}
        <CharterToc className="mt-3" hrefBase={CHARTER_TEXT_PATH} />
      </section>

      <section aria-labelledby="charter-document-title" className="mt-8">
        <h2 id="charter-document-title" className="font-sans text-2xl font-medium text-foreground">
          Документ
        </h2>
        <div className="mt-3 space-y-2">
          {documentFile ? (
            <DocumentFileRow
              badge="PDF"
              action="Открыть PDF"
              meta={`Устав · ${formatIsoDateRu(documentFile.documentDate)}`}
              href={documentFile.url}
              external
              sizeBytes={documentFile.sizeBytes}
            />
          ) : (
            <p className="text-muted-foreground">PDF пока не опубликован</p>
          )}
          <DocumentFileRow
            badge="HTML"
            action="Читать на сайте"
            meta={`Устав · ${formatIsoDateRu(CHARTER_META.editionDate)}`}
            href={CHARTER_TEXT_PATH}
          />
        </div>
      </section>
    </article>
  );
}
