import { FileText } from "lucide-react";
import { formatFileSize } from "@/lib/format-file-size";
import { formatIsoDateRu } from "@/lib/format-iso-date";

type DocumentFileCardProps = {
  label: string;
  url: string;
  sizeBytes: number;
  documentDate: string;
};

/**
 * Карточка файла документа: ссылка «Открыть PDF» с размером и датой.
 * Объект отдаётся из S3 с Content-Disposition: inline — браузер покажет PDF
 * во вкладке; атрибут download не ставится, для кросс-доменного S3 он
 * игнорируется. Общий компонент — пригодится библиотеке документов.
 */
export function DocumentFileCard({ label, url, sizeBytes, documentDate }: DocumentFileCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="group flex items-center gap-3 rounded-md bg-muted px-3 py-2.5 transition-colors hover:bg-brand-orange/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
    >
      <FileText className="size-5 shrink-0 text-brand-blue" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-ui text-sm font-medium text-foreground">{label}</span>
        <span className="block font-ui text-xs text-muted-foreground">
          Открыть PDF · {formatFileSize(sizeBytes)} · {formatIsoDateRu(documentDate)}
        </span>
      </span>
    </a>
  );
}
