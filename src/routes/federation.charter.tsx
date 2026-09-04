import { createFileRoute } from "@tanstack/react-router";
import { CharterFileRow } from "@/components/site/CharterFileRow";

const TITLE = "Устав — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION = "Устав Федерации тенниса Санкт-Петербурга и связанные с ним документы.";

export const Route = createFileRoute("/federation/charter")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: CharterPage,
});

function CharterPage() {
  return (
    <article className="max-w-3xl font-ui text-[15px] leading-[1.45] text-foreground">
      <section id="charter-intro" className="scroll-mt-6">
        <h1 className="font-sans text-3xl font-medium tracking-tight text-foreground md:text-4xl lg:text-5xl">
          Устав
        </h1>
        <div className="mt-5 space-y-3">
          <p>
            Устав определяет правовой статус, цели и задачи Федерации тенниса Санкт-Петербурга,
            порядок членства, структуру органов управления, их полномочия, а также основные
            принципы деятельности организации.
          </p>
          <p>
            Федерация является региональной общественной организацией и осуществляет свою
            деятельность в соответствии с законодательством Российской Федерации.
          </p>
        </div>
      </section>

      <section id="about-document" className="mt-7 scroll-mt-6">
        <h2 className="font-sans text-2xl font-medium text-foreground">О документе</h2>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="font-semibold">Полное наименование</dt>
            <dd className="mt-0.5 text-foreground/80">
              Устав Санкт-Петербургской Региональной Общественной организации «Спортивная
              Федерация тенниса»
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Первоначально утверждён</dt>
            <dd className="mt-0.5 text-foreground/80">22 апреля 2004 года</dd>
          </div>
          <div>
            <dt className="font-semibold">Представленная редакция</dt>
            <dd className="mt-0.5 text-foreground/80">
              С изменениями и дополнениями, утверждёнными 17 марта 2016 года
            </dd>
          </div>
        </dl>
      </section>

      <section id="scope" className="mt-8 scroll-mt-6">
        <h2 className="font-sans text-2xl font-medium text-foreground">Что регулирует Устав</h2>
        <div className="mt-3 space-y-3 text-foreground/80">
          <p>
            Устав устанавливает основные принципы деятельности Федерации: её цели и задачи,
            права и обязанности, порядок членства, устройство руководящих и
            контрольно-ревизионных органов, правила формирования и использования имущества и
            средств.
          </p>
          <p>
            Отдельные положения посвящены полномочиям Общего собрания, Правления и Президента
            Федерации, деятельности вице-президентов, ответственного секретаря и
            Контрольно-ревизионного органа.
          </p>
          <p>
            Документ также определяет порядок внесения изменений в Устав и условия реорганизации
            и ликвидации Федерации.
          </p>
        </div>
      </section>

      <section id="key-points" className="mt-8 scroll-mt-6">
        <h2 className="font-sans text-2xl font-medium text-foreground">Основные положения</h2>
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="font-semibold">Цели Федерации</h3>
            <p className="mt-1 text-foreground/80">
              Развитие и популяризация тенниса, организация и проведение спортивных мероприятий,
              подготовка спортсменов сборных команд Санкт-Петербурга и защита общих интересов
              членов организации.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Членство</h3>
            <p className="mt-1 text-foreground/80">
              Членство является добровольным. Участниками могут быть физические лица и
              общественные объединения, признающие цели Федерации и принимающие участие в её
              деятельности.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Органы управления</h3>
            <p className="mt-1 text-foreground/80">
              Высшим органом является Общее собрание членов Федерации. В период между заседаниями
              руководство осуществляет Правление Федерации.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Контроль</h3>
            <p className="mt-1 text-foreground/80">
              Контроль за соблюдением положений Устава и деятельностью Федерации осуществляет
              Контрольно-ревизионный орган.
            </p>
          </div>
        </div>
      </section>

      <section id="contents" className="mt-8 scroll-mt-6">
        <h2 className="font-sans text-2xl font-medium text-foreground">Содержание Устава</h2>
        <ol className="mt-3 list-decimal space-y-0.5 pl-6 text-foreground/80 marker:font-semibold marker:text-brand-blue">
          <li>Общие положения</li>
          <li>Цели и задачи Федерации</li>
          <li>Виды деятельности Федерации</li>
          <li>Права и обязанности Федерации</li>
          <li>Члены Федерации, их права и обязанности</li>
          <li>Руководящие и ревизионные органы Федерации</li>
          <li>Имущество и средства Федерации</li>
          <li>Предпринимательская деятельность Федерации</li>
          <li>Символика Федерации</li>
          <li>Внесение изменений в Устав</li>
          <li>Ликвидация и реорганизация Федерации</li>
        </ol>
      </section>

      <section id="full-text" className="mt-8 scroll-mt-6">
        <h2 className="font-sans text-2xl font-medium text-foreground">Полный текст документа</h2>
        <p className="mt-2 text-foreground/80">
          Полный текст Устава будет доступен для просмотра и скачивания после публикации.
        </p>
        <div className="mt-4 space-y-2" aria-label="Форматы документа">
          <CharterFileRow format="TXT" action="Открыть устав" date="17.03.2016" preview />
          <CharterFileRow format="PDF" action="Скачать устав" date="17.03.2016" size="—" />
        </div>
      </section>
    </article>
  );
}
