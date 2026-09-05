import { createFileRoute } from "@tanstack/react-router";
import { LeadershipCard } from "@/components/site/LeadershipCard";
import { listPublishedPersons } from "@/lib/federation-person-server-fn";

const TITLE = "Руководство — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Президент, вице-президенты и Правление Федерации тенниса Санкт-Петербурга: должности и зоны ответственности.";

const LEADERSHIP_MOCK = [
  {
    name: "Прокофьев Владимир Николаевич",
    role: "Президент",
    bio: "Краткая биография и зона ответственности. Здесь появится информация о деятельности, достижениях и направлениях работы в Федерации тенниса Санкт-Петербурга.",
    phone: "+7 (999) 000-00-00",
    email: "president@spbtennisfed.ru",
    links: [{ label: "Новости", href: "/federation/news" }],
  },
];

export const Route = createFileRoute("/federation/leadership")({
  loader: () => listPublishedPersons(),
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
      <h1 className="text-3xl font-medium tracking-tight text-foreground md:text-4xl lg:text-5xl">
        Руководство
      </h1>
      <p className="mt-3 max-w-2xl font-ui text-[16px] leading-[24px] text-muted-foreground">
        Президент, вице-президенты, Правление: должности и зоны ответственности, контактные данные.
      </p>

      <div className="mt-8">
        {LEADERSHIP_MOCK.map((person) => (
          <LeadershipCard key={person.name} {...person} />
        ))}
      </div>
    </article>
  ),
});
