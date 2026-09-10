import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DocumentForm } from "./DocumentForm";
import { documentsQueryKey, type DocumentParent } from "./document-parent";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

type DocumentUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Родитель — новость или событие; см. document-parent.ts. */
  parent: DocumentParent;
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  initialValues: {
    title: string;
    documentDate: string;
    section: "federation" | "referees" | "none";
  };
};

export function DocumentUploadDialog({
  open,
  onOpenChange,
  parent,
  initialValues,
  onBusyChange,
  onDirtyChange,
}: DocumentUploadDialogProps) {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<{ id: string; status: "draft" | "published" } | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const close = () => {
    setCreated(null);
    setDirty(false);
    setBusy(false);
    setConfirmClose(false);
    onOpenChange(false);
  };

  const attachMutation = useMutation({
    mutationFn: (doc: { id: string; status: "draft" | "published" }) =>
      parent.attach(doc.id).then(() => doc),
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: documentsQueryKey(parent) });
      if (doc.status !== "published") {
        toast(
          "Документ прикреплён, но не появится на сайте, пока не будет опубликован (статус «Черновик»)",
        );
      }
      toast.success("Документ прикреплён");
      close();
    },
    onError: () =>
      toast.error(`Документ создан, но не удалось прикрепить его к ${parent.labelDative}`),
  });
  useEffect(() => {
    onBusyChange?.(open && (busy || attachMutation.isPending));
  }, [open, busy, attachMutation.isPending, onBusyChange]);
  useEffect(() => {
    onDirtyChange?.(open && dirty);
  }, [open, dirty, onDirtyChange]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else if (!busy && !attachMutation.isPending) {
            if (dirty) setConfirmClose(true);
            else close();
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-y-auto rounded-lg">
          <DialogHeader>
            <DialogTitle>Загрузить новый документ</DialogTitle>
            <DialogDescription>
              Выберите файл и название, которое увидят читатели новости.
            </DialogDescription>
          </DialogHeader>

          {created ? (
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm">
                Файл уже создан.{" "}
                {attachMutation.isPending
                  ? "Прикрепляем к новости…"
                  : "Прикрепление не удалось. Можно повторить без повторной загрузки файла."}
              </p>
              <Button
                disabled={attachMutation.isPending}
                onClick={() => attachMutation.mutate(created)}
              >
                Повторить прикрепление
              </Button>
            </div>
          ) : open ? (
            <DocumentForm
              mode="create"
              bare
              initialValues={{
                title: "",
                documentDate: initialValues.documentDate,
                section: initialValues.section,
                status: "published",
                inLibrary: false,
              }}
              submitLabel={`Прикрепить к ${parent.labelDative}`}
              onDirtyChange={setDirty}
              onBusyChange={setBusy}
              onCreated={(doc) => {
                setCreated(doc);
                setBusy(false);
                setDirty(false);
                attachMutation.mutate(doc);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Закрыть без сохранения?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Введённые данные документа не сохранены. Он ещё не прикреплён к ${parent.labelDative}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить работу</AlertDialogCancel>
            <AlertDialogAction onClick={close}>Закрыть</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
