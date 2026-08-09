import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { attachDocumentToNews, listAdminDocuments } from "@/lib/documents-server-fn";
import { formatFileSize } from "@/lib/format-file-size";
import { getFileExtension } from "@/lib/image-validation";

type SectionFilter = "all" | "none" | "federation" | "referees";

const SECTION_LABEL: Record<"federation" | "referees", string> = {
  federation: "Федерация",
  referees: "Коллегия судей",
};

type DocumentAttachDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newsId: string;
  excludeDocumentIds: string[];
};

export function DocumentAttachDialog({
  open,
  onOpenChange,
  newsId,
  excludeDocumentIds,
}: DocumentAttachDialogProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [section, setSection] = useState<SectionFilter>("all");

  const documentsQuery = useQuery({
    queryKey: ["admin-documents-all"],
    queryFn: () => listAdminDocuments({ data: {} }),
    enabled: open,
  });

  const attachMutation = useMutation({
    mutationFn: (row: { id: string; status: "draft" | "published" }) =>
      attachDocumentToNews({ data: { newsId, documentId: row.id } }).then(() => row),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["news-documents", newsId] });
      if (row.status !== "published") {
        toast(
          "Документ прикреплён, но не появится на сайте, пока не будет опубликован (статус «Черновик»)",
        );
      }
    },
    onError: () => toast.error("Не удалось прикрепить документ"),
  });

  const excludeSet = useMemo(() => new Set(excludeDocumentIds), [excludeDocumentIds]);

  const filtered = (documentsQuery.data ?? []).filter((row) => {
    if (excludeSet.has(row.id)) return false;
    if (section === "none" && row.section !== null) return false;
    if (section !== "all" && section !== "none" && row.section !== section) return false;
    if (search.trim() && !row.title.toLowerCase().includes(search.trim().toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Прикрепить существующий документ</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Поиск по названию"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Select value={section} onValueChange={(value) => setSection(value as SectionFilter)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все разделы</SelectItem>
              <SelectItem value="none">Без раздела</SelectItem>
              <SelectItem value="federation">Федерация</SelectItem>
              <SelectItem value="referees">Коллегия судей</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {documentsQuery.isError ? (
            <p className="text-sm text-destructive">Не удалось загрузить список документов.</p>
          ) : documentsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ничего не найдено.</p>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{row.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {getFileExtension(row.fileName).toUpperCase()} · {formatFileSize(row.sizeBytes)}
                    {row.section ? ` · ${SECTION_LABEL[row.section]}` : ""}
                  </span>
                </div>
                <Badge variant={row.status === "published" ? "default" : "secondary"}>
                  {row.status === "published" ? "Опубликован" : "Черновик"}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  disabled={attachMutation.isPending}
                  onClick={() => attachMutation.mutate({ id: row.id, status: row.status })}
                >
                  Прикрепить
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
