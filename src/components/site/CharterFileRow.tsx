import { Download, Eye, FileText } from "lucide-react";

type CharterFileRowProps = {
  format: "TXT" | "PDF";
  action: string;
  date: string;
  size?: string;
  preview?: boolean;
};

export function CharterFileRow({ format, action, date, size, preview }: CharterFileRowProps) {
  return (
    <div className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-muted px-3 py-2.5">
      <span className="flex items-center gap-1.5 font-ui text-sm font-semibold text-foreground">
        <FileText className="size-4 text-brand-blue" aria-hidden="true" />
        {format}
      </span>
      <span className="min-w-0 font-ui">
        <span className="block text-sm font-medium text-foreground">{action}</span>
        <span className="block text-xs text-muted-foreground">Устав · {date}</span>
      </span>
      <span
        aria-label={preview ? "Предпросмотр будет доступен после публикации" : "Скачивание будет доступно после публикации"}
        className="flex items-center gap-2 text-xs text-muted-foreground"
      >
        {size ? <span>{size}</span> : null}
        {preview ? <Eye className="size-4" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
      </span>
    </div>
  );
}