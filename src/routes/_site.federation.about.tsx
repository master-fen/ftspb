import { createFileRoute } from "@tanstack/react-router";
import { FederationMobileNav } from "@/components/site/FederationMobileNav";
import { ABOUT_PARAGRAPHS } from "@/lib/federation-about";
import { ORG_CONTACTS, ORG_REQUISITES } from "@/lib/site";

const TITLE = "Общая информация — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Общая информация о Федерации тенниса Санкт-Петербурга: чем занимается Федерация, с кем взаимодействует, реквизиты организации.";

export const Route = createFileRoute("/_site/federation/about")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: () => (
    <article>
      <h1 className="ui-h1">Общая информация</h1>
      <FederationMobileNav />
      <div className="mt-8 space-y-10">
        <section
          aria-labelledby="org-about-title"
          className="font-ui text-base leading-[1.6] text-foreground"
        >
          <h2 id="org-about-title" className="ui-h2">
            О Федерации
          </h2>
          <div className="mt-4 space-y-4">
            {ABOUT_PARAGRAPHS.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        </section>
        <section
          aria-labelledby="org-requisites-title"
          className="font-ui text-base leading-[1.6] text-foreground"
        >
          <h2 id="org-requisites-title" className="ui-h2">
            Реквизиты
          </h2>
          <dl className="mt-4 space-y-4">
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
        <section
          aria-labelledby="org-contacts-title"
          className="font-ui text-base leading-[1.6] text-foreground"
        >
          <h2 id="org-contacts-title" className="ui-h2">
            Контакты
          </h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="font-semibold">Телефон</dt>
              <dd className="mt-0.5">
                <a href={`tel:${ORG_CONTACTS.phone.replace(/[^\d+]/g, "")}`} className="ui-link">
                  {ORG_CONTACTS.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-semibold">E-mail</dt>
              <dd className="mt-0.5">
                <a href={`mailto:${ORG_CONTACTS.email}`} className="ui-link">
                  {ORG_CONTACTS.email}
                </a>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </article>
  ),
});
