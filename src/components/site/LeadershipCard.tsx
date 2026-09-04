import { PersonPhotoPlaceholder } from "./PersonPhotoPlaceholder";

export interface LeadershipCardProps {
  name: string;
  role: string;
  bio?: string;
  phone?: string;
  email?: string;
  links?: { label: string; href: string }[];
  photo?: string;
}

export function LeadershipCard({
  name,
  role,
  bio,
  phone,
  email,
  links,
  photo,
}: LeadershipCardProps) {
  return (
    <article className="grid gap-5 md:grid-cols-[minmax(0,240px)_1fr]">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg md:aspect-auto md:h-full md:min-h-[320px]">
        {photo ? (
          <img src={photo} alt={name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <PersonPhotoPlaceholder className="rounded-lg" />
        )}
      </div>

      <div className="flex min-w-0 flex-col py-1">
        <h2 className="font-ui text-xl font-semibold leading-tight text-foreground md:text-2xl">
          {name}
        </h2>
        <p className="mt-1 font-ui text-base font-medium text-brand-blue">{role}</p>

        {bio ? (
          <p className="mt-4 max-w-2xl font-ui text-[15px] leading-relaxed text-muted-foreground">
            {bio}
          </p>
        ) : null}

        <div className="mt-5 space-y-2 font-ui text-[15px] leading-snug text-foreground">
          {phone ? (
            <p>
              <span className="text-muted-foreground">Телефон:</span>{" "}
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="hover:text-brand-blue hover:underline"
              >
                {phone}
              </a>
            </p>
          ) : null}
          {email ? (
            <p>
              <span className="text-muted-foreground">Email:</span>{" "}
              <a href={`mailto:${email}`} className="hover:text-brand-blue hover:underline">
                {email}
              </a>
            </p>
          ) : null}
          {links && links.length > 0 ? (
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Социальные сети/новости:</span>
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-brand-blue hover:underline"
                >
                  {link.label}
                </a>
              ))}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
