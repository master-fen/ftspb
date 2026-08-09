import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { attachDocumentToNews } from "@/lib/documents-server-fn";
import { DocumentForm } from "./DocumentForm";

type DocumentUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newsId: string;
  initialValues: {
    title: string;
    documentDate: string;
    section: "federation" | "referees" | "none";
  };
};

export function DocumentUploadDialog({
  open,
  onOpenChange,
  newsId,
  initialValues,
}: DocumentUploadDialogProps) {
  const queryClient = useQueryClient();

  const attachMutation = useMutation({
    mutationFn: (doc: { id: string; status: "draft" | "published" }) =>
      attachDocumentToNews({ data: { newsId, documentId: doc.id } }).then(() => doc),
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["news-documents", newsId] });
      if (doc.status !== "published") {
        toast(
          "Документ прикреплён, но не появится на сайте, пока не будет опубликован (статус «Черновик»)",
        );
      }
      onOpenChange(false);
    },
    onError: () => toast.error("Документ создан, но не удалось прикрепить его к новости"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Загрузить новый документ</DialogTitle>
        </DialogHeader>

        {open ? (
          <DocumentForm
            mode="create"
            bare
            initialValues={{
              title: initialValues.title,
              documentDate: initialValues.documentDate,
              section: initialValues.section,
              status: "published",
              inLibrary: false,
            }}
            onCreated={(doc) => attachMutation.mutate(doc)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
