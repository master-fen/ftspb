import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/site/ComingSoon";

const TITLE = "Политика конфиденциальности — Федерация тенниса Санкт-Петербурга";
const DESCRIPTION =
  "Политика конфиденциальности Федерации тенниса Санкт-Петербурга. Раздел в разработке.";

export const Route = createFileRoute("/_site/privacy")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <>
      <ComingSoon
        title="Политика конфиденциальности"
        description="Здесь будет опубликован документ о том, какие персональные данные обрабатывает Федерация тенниса Санкт-Петербурга, с какой целью они собираются и как обеспечивается их защита."
      />
      <section id="cookies" className="mx-auto max-w-3xl scroll-mt-24 px-4 pb-16 md:px-6 xl:px-10">
        <h2 className="ui-h2">Файлы cookie и статистика посещений</h2>
        <p className="mt-4">
          Сайт использует сервис веб-аналитики Яндекс Метрика (ООО «Яндекс»). Метрика сохраняет в
          браузере файлы cookie и передаёт Яндексу сведения о посещении: адрес открытой страницы и
          страницы, с которой выполнен переход, время визита, тип устройства и браузера,
          приблизительное местоположение по IP-адресу.
        </p>
        <p className="mt-4">
          Федерация использует эти сведения только в виде сводной статистики — чтобы понимать, какие
          разделы сайта востребованы. Запись действий посетителей на страницах (Вебвизор) не
          ведётся.
        </p>
        <p className="mt-4">
          Отказаться от сбора можно, запретив файлы cookie для этого сайта в настройках браузера.
          Порядок обработки данных Яндексом описан в его политике конфиденциальности:{" "}
          <a
            href="https://yandex.ru/legal/confidential/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            https://yandex.ru/legal/confidential/
          </a>
        </p>
      </section>
    </>
  );
}
