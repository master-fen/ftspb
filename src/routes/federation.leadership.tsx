import { createFileRoute } from "@tanstack/react-router";
import { LeadershipCard } from "@/components/site/LeadershipCard";
import { listPublishedPersons } from "@/lib/federation-person-server-fn";

const TITLE = "Руководство — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Президент, вице-президенты и Правление Федерации тенниса Санкт-Петербурга: должности и зоны ответственности.";

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
  component: LeadershipPage,
});

function LeadershipPage() {
  const persons = Route.useLoaderData();

  return (
    <article>
      <h1 className="text-3xl font-medium tracking-tight text-foreground md:text-4xl lg:text-5xl">
        Руководство
      </h1>
      <p className="mt-3 max-w-2xl font-ui text-[16px] leading-[24px] text-muted-foreground">
        Президент, вице-президенты, Правление: должности и зоны ответственности, контактные данные.
      </p>

      {persons.length === 0 ? (
        <p className="mt-8 rounded-xl bg-muted p-8 text-center text-muted-foreground">
          Раздел заполняется
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          {persons.map((person) => (
            <LeadershipCard
              key={person.id}
              name={person.fullName}
              role={person.role}
              bio={person.bio ?? undefined}
              phone={person.phone ?? undefined}
              email={person.email ?? undefined}
              photo={person.photoUrl ?? undefined}
            />
          ))}
        </div>
      )}
    </article>
  );
}
