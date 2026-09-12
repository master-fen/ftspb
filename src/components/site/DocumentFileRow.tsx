import { Link } from "@tanstack/react-router";
import { Download, Eye, FileText } from "lucide-react";
import { formatFileSize } from "@/lib/format-file-size";

type DocumentFileRowProps = {
  /** Бейдж формата: `PDF`, `HTML`, `DOCX`, … — см. src/lib/document-badge.ts. */
  badge: string;
  /** Действие: «Открыть PDF», «Читать на сайте». */
  action: string;
  /** Подстрочник: «Устав · 17.03.2016». */
  meta: string;
  href: string;
  /** Внешняя ссылка (файл в S3): `<a target="_blank">`; иначе клиентский `Link`. */
  external?: boolean;
  sizeBytes?: number;
};

const ROW_CLASS =
  "group flex items-center gap-3 rounded-md bg-muted px-3 py-2.5 ui-link-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue";

/**
 * Строка файла документа: слева иконка и бейдж формата, в центре действие и
 * подстрочник, справа размер (если известен) и иконка действия. PDF отдаётся
 * из S3 с Content-Disposition: inline — браузер покажет его во вкладке;
 * атрибут download не ставится, для кросс-доменного S3 он игнорируется.
 */
export function DocumentFileRow({
  badge,
  action,
  meta,
  href,
  external = false,
  sizeBytes,
}: DocumentFileRowProps) {
  const ActionIcon = badge === "HTML" ? Eye : Download;

  const content = (
    <>
      <span className="flex w-20 shrink-0 items-center gap-1.5">
        <FileText className="size-5 text-brand-blue" aria-hidden="true" />
        <span className="rounded bg-brand-blue/10 px-1.5 py-0.5 font-ui text-[11px] font-semibold tracking-wide text-brand-blue">
          {badge}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-ui text-sm font-medium text-foreground">{action}</span>
        <span className="block font-ui text-xs text-muted-foreground">{meta}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 font-ui text-xs text-muted-foreground">
        {sizeBytes !== undefined ? <span>{formatFileSize(sizeBytes)}</span> : null}
        <ActionIcon
          className="size-4 text-foreground/50 transition-colors group-hover:text-brand-blue"
          aria-hidden="true"
        />
      </span>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener" className={ROW_CLASS}>
        {content}
      </a>
    );
  }
  return (
    <Link to={href} className={ROW_CLASS}>
      {content}
    </Link>
  );
}
