import { Link } from "@tanstack/react-router";
import { navSections, siteMeta } from "@/data/mock";
import { ORG_CONTACTS, ORG_REQUISITES } from "@/lib/site";
import { Logo } from "./Logo";

/**
 * Подвал по макету дизайнера (13.10.2026). С `lg` — сетка страницы на 12
 * колонок: логотип 1–3, меню 4–7 (внутри две колонки по две), контакты 9–12
 * (иконка прижата к правому краю колонки 9, текст с колонки 10). Нижний ряд —
 * та же сетка: реквизиты 1–6, правовые ссылки с 7, копирайт под реквизитами.
 *
 * Меню — «Главная» и опубликованные разделы `navSections`; скрытые разделы
 * появятся здесь сами, когда с них снимут `hidden`. Колонки меню заполняются
 * по столбцам, число строк — половина пунктов с округлением вверх. С `lg`
 * пункт не переносится: на 1024 колонка ≈141 px, а «Календарь турниров» в две
 * строки раздвигал строку сетки и сдвигал соседнюю колонку; лишние пиксели
 * уходят в свободную колонку 8.
 */
const FOOTER_LINKS = [{ label: "Главная", href: "/" }, ...navSections];

const NAV_ROWS = Math.ceil(FOOTER_LINKS.length / 2);

// Строка контакта: ниже `lg` — иконка и текст рядом, с `lg` — четыре колонки
// сетки страницы, иконка в первой, текст в трёх остальных.
const contactRowClass = "flex items-center gap-3 lg:grid lg:grid-cols-4 lg:gap-x-5";
const contactIconClass = "size-6 shrink-0 text-inverse-foreground lg:justify-self-end";
const contactLinkClass = "ui-link lg:col-span-3 lg:justify-self-start";

export function SiteFooter() {
  return (
    <footer className="bg-inverse text-inverse-foreground">
      <div className="mx-auto max-w-7xl lg:box-content px-4 py-8 md:px-6 lg:px-10">
        <div className="grid gap-x-5 gap-y-8 md:grid-cols-2 lg:grid-cols-12">
          {/* Logo — on white plate to keep the navy PNG visible on navy footer */}
          <div className="md:row-span-2 lg:col-span-3 lg:row-span-1">
            <div className="inline-block rounded-xl bg-logo-plate p-3">
              <Logo sizeClassName="h-28 md:h-32 lg:h-37" />
            </div>
          </div>

          <nav className="lg:col-span-4 lg:col-start-4">
            <ul
              className="grid grid-flow-col grid-cols-2 gap-x-5 gap-y-3 text-sm"
              style={{ gridTemplateRows: `repeat(${NAV_ROWS}, auto)` }}
            >
              {FOOTER_LINKS.map((s) => (
                <li key={s.label}>
                  <Link
                    to={s.href}
                    activeOptions={{ exact: true }}
                    className="font-ui font-bold text-inverse-foreground ui-link lg:whitespace-nowrap"
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <address className="not-italic lg:col-span-4 lg:col-start-9">
            <ul className="flex flex-col gap-y-4 font-ui text-sm font-medium text-inverse-foreground-muted lg:gap-y-5">
              <li className={contactRowClass}>
                <PinIcon className={contactIconClass} />
                <span className="lg:col-span-3">{ORG_REQUISITES.address}</span>
              </li>
              <li className={contactRowClass}>
                <PhoneIcon className={contactIconClass} />
                <a
                  href={`tel:${ORG_CONTACTS.phone.replace(/[^\d+]/g, "")}`}
                  className={contactLinkClass}
                >
                  {ORG_CONTACTS.phone}
                </a>
              </li>
              <li className={contactRowClass}>
                <MailIcon className={contactIconClass} />
                <a href={`mailto:${ORG_CONTACTS.email}`} className={contactLinkClass}>
                  {ORG_CONTACTS.email}
                </a>
              </li>
            </ul>
          </address>
        </div>

        <div className="mt-8 border-t border-inverse-border pt-6 text-xs text-inverse-foreground-muted lg:mt-5 lg:pt-2">
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:gap-y-2">
            <p className="lg:col-span-6">
              {ORG_REQUISITES.fullName}, ОГРН {ORG_REQUISITES.ogrn}
            </p>
            <ul className="flex flex-col gap-3 md:flex-row md:flex-wrap md:gap-x-8 lg:col-span-6">
              {siteMeta.legal.map((l) => (
                <li key={l.label}>
                  <Link to={l.href} className="ui-link">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="lg:col-span-6">{siteMeta.copyright}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

/*
 * Залитые иконки контактов — по макету; остальные иконки сайта контурные
 * (lucide). Контуры — Material Icons, Apache License 2.0
 * (https://github.com/google/material-design-icons): place, phone, email.
 */
type IconProps = { className?: string };

function PinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
}

function PhoneIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

function MailIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  );
}
