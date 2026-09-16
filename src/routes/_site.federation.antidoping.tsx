import { createFileRoute } from "@tanstack/react-router";
import { DocumentFileRow } from "@/components/site/DocumentFileRow";
import { FederationMobileNav } from "@/components/site/FederationMobileNav";
import {
  ANTIDOPING_GROUPS,
  ANTIDOPING_REPORT_URL,
  ANTIDOPING_RESPONSIBLE,
  ANTIDOPING_UPDATED_AT,
  type AntidopingLink,
} from "@/data/antidoping";

const TITLE = "Антидопинг — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Ответственный за антидопинговое обеспечение, нормативные документы, ответственность за нарушения, памятки и сервисы РУСАДА.";

export const Route = createFileRoute("/_site/federation/antidoping")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: AntidopingPage,
});

/** Группа «Подробнее об ответственности» стоит внутри блока об ответственности, под h3. */
const VIOLATIONS_GROUPS = ANTIDOPING_GROUPS.filter((group) => group.id === "violations");
const SECTION_GROUPS = ANTIDOPING_GROUPS.filter((group) => group.id !== "violations");

/**
 * Строка внешней ссылки — строка документа с переносом названия; вторая строка
 * собирается по образцу «Устав · дата»: действие и примечание, если оно есть.
 * `kind: "pdf"` — внешние файлы на чужих доменах, не документы из S3.
 */
function LinkRows({ links }: { links: AntidopingLink[] }) {
  return (
    <>
      {links.map((link) => (
        <DocumentFileRow
          key={link.href}
          badge={link.kind === "pdf" ? "PDF" : "HTML"}
          action={link.title}
          meta={[link.kind === "pdf" ? "Открыть PDF" : "Открыть", link.note]
            .filter(Boolean)
            .join(" · ")}
          href={link.href}
          external
          wrapTitle={true}
        />
      ))}
    </>
  );
}

/**
 * Раму (шапка, крошки, боковое меню, подвал) рисует макет раздела
 * (src/routes/_site.federation.tsx) — здесь только содержимое колонки.
 */
function AntidopingPage() {
  return (
    <article>
      <h1 className="ui-h1">Антидопинг</h1>
      <FederationMobileNav />
      <div className="mt-5 space-y-4 font-ui text-base leading-[1.6] text-foreground">
        <p>
          Федерация тенниса Санкт-Петербурга придерживается принципа нулевой терпимости к допингу и
          ведёт антидопинговую работу в соответствии с Федеральным законом «О физической культуре и
          спорте в Российской Федерации», Общероссийскими антидопинговыми правилами, Антидопинговой
          программой тенниса (ITIA) и методическими рекомендациями Минспорта России (приказ от 20
          декабря 2021 г. № 998).
        </p>
        <p>
          Здесь собраны документы, памятки и сервисы для спортсменов, тренеров, родителей и
          медицинского персонала. Большинство материалов размещены на сайтах РУСАДА, Минспорта
          России и Федерации тенниса России — на этой странице даны ссылки на их актуальные версии.
        </p>
      </div>

      <section
        aria-labelledby="antidoping-responsible-title"
        className="mt-10 font-ui text-base leading-[1.6] text-foreground"
      >
        <h2 id="antidoping-responsible-title" className="ui-h2">
          Ответственный за антидопинговое обеспечение
        </h2>
        <div className="mt-4 ui-card ring-card-border bg-card-surface p-5 md:p-6">
          <p className="font-semibold">{ANTIDOPING_RESPONSIBLE.name}</p>
          <p className="mt-1">{ANTIDOPING_RESPONSIBLE.position}</p>
          <p className="mt-3">
            <a href={`mailto:${ANTIDOPING_RESPONSIBLE.email}`} className="ui-link">
              {ANTIDOPING_RESPONSIBLE.email}
            </a>
          </p>
          <p className="mt-1">
            <a href={`tel:${ANTIDOPING_RESPONSIBLE.phoneHref}`} className="ui-link">
              {ANTIDOPING_RESPONSIBLE.phone}
            </a>
          </p>
        </div>
        <p className="mt-4">
          По вопросам антидопингового образования, участия в программах РУСАДА и за консультацией по
          оформлению разрешения на терапевтическое использование обращайтесь к ответственному.
        </p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <a
            href={ANTIDOPING_REPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-5 py-2.5 text-sm font-semibold text-brand-navy-foreground transition-colors hover:bg-brand-orange"
          >
            Сообщить о допинге
          </a>
          <span className="font-ui ui-caption">Сообщение принимает РУСАДА, можно анонимно.</span>
        </div>
      </section>

      <section
        aria-labelledby="antidoping-liability-title"
        className="mt-10 font-ui text-base leading-[1.6] text-foreground"
      >
        <h2 id="antidoping-liability-title" className="ui-h2">
          Ответственность за нарушение антидопинговых правил
        </h2>
        <p className="mt-4">
          Антидопинговые правила действуют для всех участников соревнований, входящих в календарь
          Федерации, независимо от возраста и уровня. Спортсмен отвечает за всё, что попадает в его
          организм: нарушение фиксируется по факту обнаружения запрещённой субстанции, и незнание,
          совет тренера или врача, состав спортивного питания не освобождают от ответственности.
        </p>
        <p className="mt-4">
          Всемирный антидопинговый кодекс и Общероссийские антидопинговые правила выделяют
          одиннадцать видов нарушений:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-6">
          <li>наличие запрещённой субстанции, её метаболитов или маркеров в пробе спортсмена;</li>
          <li>использование или попытка использования запрещённой субстанции или метода;</li>
          <li>уклонение, отказ или неявка на процедуру сдачи пробы;</li>
          <li>
            нарушение порядка предоставления информации о местонахождении — любое сочетание трёх
            пропущенных тестов и (или) непредоставлений информации в течение двенадцати месяцев
            спортсменом, включённым в регистрируемый пул тестирования;
          </li>
          <li>фальсификация или попытка фальсификации на любом этапе допинг-контроля;</li>
          <li>обладание запрещённой субстанцией или методом;</li>
          <li>распространение или попытка распространения запрещённой субстанции или метода;</li>
          <li>назначение или попытка назначения спортсмену запрещённой субстанции или метода;</li>
          <li>соучастие или попытка соучастия;</li>
          <li>
            запрещённое сотрудничество — взаимодействие в профессиональном или связанном со спортом
            качестве с персоналом спортсмена, который отбывает дисквалификацию или признан виновным
            в действиях, равнозначных нарушению антидопинговых правил, а также с подставными лицами
            и посредниками таких лиц;
          </li>
          <li>
            действия, направленные на воспрепятствование добросовестному сообщению уполномоченным
            органам о возможном нарушении или на преследование за такое сообщение.
          </li>
        </ol>
        <p className="mt-4">
          Последствия для спортсмена — аннулирование результатов и дисквалификация: за первое
          нарушение — как правило, от двух до четырёх лет, при отсутствии вины или незначительной
          вине, а также для защищённых лиц срок сокращается вплоть до предупреждения; за
          распространение и назначение запрещённых субстанций или методов — от четырёх лет до
          пожизненной; при повторных нарушениях — вплоть до пожизненной. Помимо спортивных санкций
          спортсмен несёт административную ответственность за умышленное использование или попытку
          использования запрещённой субстанции или метода (часть 1 статьи 6.18 КоАП РФ — штраф от 30
          до 50 тысяч рублей). Дисквалифицированный спортсмен не вправе участвовать в любом качестве
          в соревнованиях и мероприятиях Федерации, Федерации тенниса России и других организаций,
          признающих Кодекс.
        </p>
        <p className="mt-4">
          Тренер, врач и иной персонал спортсмена несут собственную ответственность: дисквалификация
          по антидопинговым правилам, административная ответственность за распространение
          запрещённой субстанции или метода (часть 2 статьи 6.18 КоАП РФ — штраф от 40 до 80 тысяч
          рублей) и уголовная ответственность (статьи 230.1 и 230.2 УК РФ — склонение спортсмена к
          использованию запрещённых субстанций и методов и их использование в отношении спортсмена).
          Спортивная дисквалификация на срок шесть и более месяцев, а также нарушение спортсменом
          антидопинговых правил, в том числе однократное, — основания для расторжения трудового
          договора со спортсменом (статья 348.11 ТК РФ), нарушение антидопинговых правил тренером —
          с тренером (статья 348.11-1 ТК РФ).
        </p>
        {VIOLATIONS_GROUPS.map((group) => (
          <div key={group.id} className="mt-8">
            <h3 className="ui-h3">{group.title}</h3>
            <div className="mt-3 space-y-2">
              <LinkRows links={group.links} />
            </div>
          </div>
        ))}
      </section>

      {SECTION_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`antidoping-${group.id}-title`} className="mt-10">
          <h2 id={`antidoping-${group.id}-title`} className="ui-h2">
            {group.title}
          </h2>
          <div className="mt-4 space-y-2">
            <LinkRows links={group.links} />
          </div>
        </section>
      ))}

      <p className="mt-10 font-ui text-sm leading-[1.6] text-muted-foreground">
        Актуально на {ANTIDOPING_UPDATED_AT}. Раздел обновляется не позднее одного месяца со дня
        поступления от Федерации тенниса России информации об изменениях в Общероссийских
        антидопинговых правилах и перечнях субстанций и (или) методов, запрещённых для использования
        в спорте.
      </p>
    </article>
  );
}
