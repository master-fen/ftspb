import { createFileRoute } from "@tanstack/react-router";
import { SectionPagePlaceholder } from "@/components/site/SectionPagePlaceholder";
import { ORG_REQUISITES } from "@/lib/site";

const TITLE = "Общая информация — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Общая информация о Федерации тенниса Санкт-Петербурга: история, миссия и направления работы.";

export const Route = createFileRoute("/federation/about")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: () => (
    <>
      <SectionPagePlaceholder
        title="Общая информация"
        description="Здесь будет рассказ об истории, миссии и направлениях работы Федерации тенниса Санкт-Петербурга."
      />
      <section
        aria-labelledby="org-requisites-title"
        className="mt-8 font-ui text-base leading-[1.6] text-foreground"
      >
        <h2 id="org-requisites-title" className="font-sans text-2xl font-medium text-foreground">
          Реквизиты
        </h2>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="font-semibold">Полное наименование</dt>
            <dd className="mt-0.5">{ORG_REQUISITES.fullName}</dd>
          </div>
          <div>
            <dt className="font-semibold">Сокращённое наименование</dt>
            <dd className="mt-0.5">{ORG_REQUISITES.shortName}</dd>
          </div>
          <div>
            <dt className="font-semibold">ОГРН</dt>
            <dd className="mt-0.5">{ORG_REQUISITES.ogrn}</dd>
          </div>
          <div>
            <dt className="font-semibold">Государственная регистрация</dt>
            <dd className="mt-0.5">
              <time dateTime={ORG_REQUISITES.registrationDate}>
                {ORG_REQUISITES.registrationDateText}
              </time>
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Адрес</dt>
            <dd className="mt-0.5">{ORG_REQUISITES.address}</dd>
          </div>
        </dl>
      </section>
    </>
  ),
});
