import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Paperclip, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/format-file-size";
import { getFileExtension } from "@/lib/image-validation";
import { DocumentAttachDialog } from "./DocumentAttachDialog";
import { DocumentUploadDialog } from "./DocumentUploadDialog";
import { documentsQueryKey, type DocumentParent } from "./document-parent";

/**
 * Галерея прикреплённых документов. Родитель (новость или событие) приходит
 * адаптером: сам компонент не знает, к чему крепит, и не дублируется.
 */
type DocumentGalleryProps = {
  parent: DocumentParent;
  /** Предзаполнение формы нового документа. */
  uploadDefaults: {
    title: string;
    documentDate: string;
    section: "federation" | "referees" | null;
  };
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

function moveDocument<T extends { id: string }>(items: T[], id: string, direction: -1 | 1): T[] {
  const index = items.findIndex((item) => item.id === id);
  const swapWith = index + direction;
  if (index < 0 || swapWith < 0 || swapWith >= items.length) return items;
  const next = [...items];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  return next;
}

export function DocumentGallery({
  parent,
  uploadDefaults,
  onBusyChange,
  onDirtyChange,
}: DocumentGalleryProps) {
  const queryClient = useQueryClient();
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const queryKey = documentsQueryKey(parent);

  const documentsQuery = useQuery({
    queryKey,
    queryFn: () => parent.list(),
  });

  const invalidateDocuments = () => queryClient.invalidateQueries({ queryKey });

  const reorderMutation = useMutation({
    mutationFn: (orderedDocumentIds: string[]) => parent.reorder(orderedDocumentIds),
    onSuccess: invalidateDocuments,
    onError: () => {
      toast.error("Не удалось сохранить порядок");
      // Локальный оптимистичный порядок разошёлся с базой — откатываем.
      invalidateDocuments();
    },
  });

  const detachMutation = useMutation({
    mutationFn: (documentId: string) => parent.detach(documentId),
    onSuccess: () => {
      invalidateDocuments();
      toast.success("Документ откреплён и остался в разделе «Документы»");
    },
    onError: () => toast.error("Не удалось открепить документ"),
  });

  const handleReorder = (id: string, direction: -1 | 1) => {
    const current = documentsQuery.data ?? [];
    const next = moveDocument(current, id, direction);
    if (next === current) return;
    queryClient.setQueryData(queryKey, next);
    reorderMutation.mutate(next.map((doc) => doc.id));
  };

  const documents = documentsQuery.data ?? [];
  const attachedIds = documents.map((doc) => doc.id);

  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Изменения здесь сохраняются сразу. Загружайте новый файл или выбирайте уже созданный
        документ.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setUploadOpen(true)}>
          <UploadCloud className="h-4 w-4" />
          Загрузить файл
        </Button>
        <Button type="button" variant="outline" onClick={() => setAttachOpen(true)}>
          <Paperclip className="h-4 w-4" />
          Выбрать из документов
        </Button>
      </div>

      {documentsQuery.isError ? (
        <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-destructive">
          <span>Не удалось загрузить документы.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => documentsQuery.refetch()}
          >
            Повторить
          </Button>
        </div>
      ) : documentsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет прикреплённых документов.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((doc, index) => (
            <div key={doc.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-words font-medium underline-offset-2 hover:underline"
                >
                  {doc.title}
                </a>
                <span className="break-all text-xs text-muted-foreground">{doc.fileName}</span>
                <span className="text-xs text-muted-foreground">
                  {getFileExtension(doc.fileName).toUpperCase()} · {formatFileSize(doc.sizeBytes)}
                </span>
              </div>
              {doc.status !== "published" ? (
                <Badge variant="secondary">Черновик · скрыт на сайте</Badge>
              ) : null}
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={index === 0 || reorderMutation.isPending}
                  onClick={() => handleReorder(doc.id, -1)}
                  aria-label="Переместить выше"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={index === documents.length - 1 || reorderMutation.isPending}
                  onClick={() => handleReorder(doc.id, 1)}
                  aria-label="Переместить ниже"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={detachMutation.isPending}
                  onClick={() => detachMutation.mutate(doc.id)}
                >
                  <X className="h-4 w-4" />
                  Открепить
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[0.8rem] text-muted-foreground">
        {`«Открепить» снимает документ с этой записи, но оставляет его в разделе «Документы».`}
      </p>

      <DocumentAttachDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        parent={parent}
        excludeDocumentIds={attachedIds}
      />

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        parent={parent}
        initialValues={{
          title: uploadDefaults.title,
          documentDate: uploadDefaults.documentDate,
          section: uploadDefaults.section ?? "none",
        }}
        onBusyChange={onBusyChange}
        onDirtyChange={onDirtyChange}
      />
    </div>
  );
}
