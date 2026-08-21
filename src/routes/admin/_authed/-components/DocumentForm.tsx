import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sanitizeTitle } from "@/lib/content-disposition";
import { createDocument, updateDocument } from "@/lib/documents-server-fn";
import { formatFileSize } from "@/lib/format-file-size";
import {
  DOCUMENT_EXTENSIONS,
  getFileExtension,
  isWithinSizeLimit,
  MAX_UPLOAD_BYTES,
} from "@/lib/image-validation";
import { useUnsavedChangesBlocker } from "../-hooks/use-unsaved-changes-blocker";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

type AdminDocument = {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  section: "federation" | "referees" | null;
  documentDate: string;
  status: "draft" | "published";
  inLibrary: boolean;
  url: string;
};

type DocumentFormProps =
  | {
      mode: "create";
      initialValues?: {
        title?: string;
        section?: "federation" | "referees" | "none";
        documentDate?: string;
        status?: "draft" | "published";
        inLibrary?: boolean;
      };
      onCreated?: (document: { id: string; status: "draft" | "published" }) => void;
      bare?: boolean;
    }
  | { mode: "edit"; document: AdminDocument; bare?: boolean };

type UploadResult = {
  key: string;
  url: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
};

type PendingUpload = {
  file: File;
  uploadedTitle: string;
  result: UploadResult;
};

type UploadWidgetState =
  | { status: "idle" }
  | { status: "uploading"; progress: number }
  | { status: "error"; message: string };

const formSchema = z.object({
  title: z.string().min(1, "Введите название"),
  section: z.enum(["none", "federation", "referees"]),
  documentDate: z.string().min(1, "Укажите дату"),
  status: z.enum(["draft", "published"]),
  inLibrary: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function validateDocumentFile(file: File): string | null {
  if (!isWithinSizeLimit(file.size, MAX_UPLOAD_BYTES)) return "Файл больше 15 МБ";
  const extension = getFileExtension(file.name);
  if (!DOCUMENT_EXTENSIONS.includes(extension)) {
    return `Неподдерживаемый формат файла. Допустимые форматы: ${DOCUMENT_EXTENSIONS.join(", ")}`;
  }
  return null;
}

/** Тот же XHR-паттерн, что NewsPhotoGallery.uploadFile — ради xhr.upload.onprogress. */
function uploadDocumentFile(
  title: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("kind", "document");
    formData.append("title", title);
    formData.append("file", file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResult);
        } catch {
          reject(new Error("Некорректный ответ сервера"));
        }
      } else {
        let message = "Не удалось загрузить файл";
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // оставляем сообщение по умолчанию
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Сетевая ошибка при загрузке"));
    xhr.send(formData);
  });
}

export function DocumentForm(props: DocumentFormProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [uploadWidget, setUploadWidget] = useState<UploadWidgetState>({ status: "idle" });
  const [currentFile, setCurrentFile] = useState(
    props.mode === "edit"
      ? {
          fileName: props.document.fileName,
          sizeBytes: props.document.sizeBytes,
          url: props.document.url,
        }
      : null,
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues:
      props.mode === "create"
        ? {
            title: props.initialValues?.title ?? "",
            section: props.initialValues?.section ?? "none",
            documentDate: props.initialValues?.documentDate ?? todayIso(),
            status: props.initialValues?.status ?? "draft",
            inLibrary: props.initialValues?.inLibrary ?? true,
          }
        : {
            title: props.document.title,
            section: props.document.section ?? "none",
            documentDate: props.document.documentDate,
            status: props.document.status,
            inLibrary: props.document.inLibrary,
          },
  });

  const {
    formState: { isDirty },
  } = form;
  const blocker = useUnsavedChangesBlocker(!props.bare && (isDirty || pendingUpload !== null));
  const watchedTitle = form.watch("title");

  useEffect(() => {
    if (!isDirty && pendingUpload === null) {
      return;
    }
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, pendingUpload]);

  const fileInputDisabled = sanitizeTitle(watchedTitle).length === 0;

  const handleFileSelected = async (file: File) => {
    const validationError = validateDocumentFile(file);
    if (validationError) {
      toast.error(`${file.name}: ${validationError}`);
      return;
    }
    setUploadWidget({ status: "uploading", progress: 0 });
    try {
      const result = await uploadDocumentFile(form.getValues("title"), file, (progress) =>
        setUploadWidget({ status: "uploading", progress }),
      );
      setPendingUpload({ file, uploadedTitle: sanitizeTitle(form.getValues("title")), result });
      setUploadWidget({ status: "idle" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить файл";
      setUploadWidget({ status: "error", message });
      toast.error(`${file.name}: ${message}`);
    }
  };

  const createMutation = useMutation({
    mutationFn: (input: { values: FormValues; upload: PendingUpload }) =>
      createDocument({
        data: {
          title: input.values.title,
          s3Key: input.upload.result.key,
          fileName: input.upload.result.fileName,
          sizeBytes: input.upload.result.sizeBytes,
          mimeType: input.upload.result.mimeType,
          section: input.values.section === "none" ? null : input.values.section,
          documentDate: input.values.documentDate,
          status: input.values.status,
          inLibrary: input.values.inLibrary,
        },
      }),
    onSuccess: ({ id, status }, variables) => {
      if (props.mode === "create" && props.onCreated) {
        props.onCreated({ id, status });
      } else {
        form.reset(variables.values);
        setPendingUpload(null);
        blocker.bypassNextNavigation();
        navigate({ to: "/admin/documents/$id", params: { id } });
      }
    },
    onError: () => toast.error("Не удалось создать документ"),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; values: FormValues; upload: PendingUpload | null }) =>
      updateDocument({
        data: {
          id: input.id,
          input: {
            title: input.values.title,
            section: input.values.section === "none" ? null : input.values.section,
            documentDate: input.values.documentDate,
            status: input.values.status,
            inLibrary: input.values.inLibrary,
            ...(input.upload
              ? {
                  s3Key: input.upload.result.key,
                  fileName: input.upload.result.fileName,
                  sizeBytes: input.upload.result.sizeBytes,
                  mimeType: input.upload.result.mimeType,
                }
              : {}),
          },
        },
      }),
    onSuccess: (_result, input) => {
      toast.success("Изменения сохранены");
      form.reset(input.values);
      if (input.upload) {
        setCurrentFile({
          fileName: input.upload.result.fileName,
          sizeBytes: input.upload.result.sizeBytes,
          url: input.upload.result.url,
        });
      }
      setPendingUpload(null);
    },
    onError: () => toast.error("Не удалось сохранить изменения"),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    let upload = pendingUpload;

    if (upload) {
      const currentSanitized = sanitizeTitle(values.title);
      if (currentSanitized !== upload.uploadedTitle) {
        // Название изменилось с момента загрузки файла — Content-Disposition
        // уже загруженного объекта устарел бы. Перезаливаем тот же файл с
        // актуальным названием перед сохранением метаданных.
        setUploadWidget({ status: "uploading", progress: 0 });
        try {
          const result = await uploadDocumentFile(values.title, upload.file, (progress) =>
            setUploadWidget({ status: "uploading", progress }),
          );
          upload = { file: upload.file, uploadedTitle: currentSanitized, result };
          setPendingUpload(upload);
          setUploadWidget({ status: "idle" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Не удалось загрузить файл";
          setUploadWidget({ status: "error", message });
          toast.error(message);
          return; // createDocument/updateDocument не вызывается — частичного сохранения быть не должно
        }
      }
    }

    if (props.mode === "create") {
      if (!upload) return;
      createMutation.mutate({ values, upload });
    } else {
      updateMutation.mutate({ id: props.document.id, values, upload });
    }
  });

  const submitDisabled =
    isSaving || uploadWidget.status === "uploading" || (props.mode === "create" && !pendingUpload);

  const formElement = (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Название</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Файл</span>
          {currentFile ? (
            <p className="text-sm text-muted-foreground">
              Текущий файл:{" "}
              <a
                href={currentFile.url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {currentFile.fileName}
              </a>{" "}
              ({formatFileSize(currentFile.sizeBytes)})
            </p>
          ) : null}
          {pendingUpload ? (
            <p className="text-sm text-muted-foreground">
              {currentFile ? "Новый файл" : "Файл"} готов к сохранению: {pendingUpload.file.name} (
              {formatFileSize(pendingUpload.result.sizeBytes)})
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={fileInputDisabled || uploadWidget.status === "uploading"}
            onClick={() => fileInputRef.current?.click()}
          >
            {currentFile ? "Заменить файл" : "Выбрать файл"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx"
            disabled={fileInputDisabled}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelected(file);
              e.target.value = "";
            }}
          />
          <p className="text-[0.8rem] text-muted-foreground">
            Название используется как имя файла при скачивании — заполните его, прежде чем загружать
            файл.
          </p>
          {uploadWidget.status === "uploading" ? (
            <Progress value={uploadWidget.progress} />
          ) : uploadWidget.status === "error" ? (
            <p className="text-[0.8rem] text-destructive">{uploadWidget.message}</p>
          ) : null}
        </div>

        <FormField
          control={form.control}
          name="section"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Раздел</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">Без раздела</SelectItem>
                  <SelectItem value="federation">Федерация</SelectItem>
                  <SelectItem value="referees">Коллегия судей</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="documentDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Дата документа</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <p className="text-[0.8rem] text-muted-foreground">
                Дата самого документа (приказа, регламента, письма), а не дата загрузки в систему.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Статус</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="draft">Черновик</SelectItem>
                  <SelectItem value="published">Опубликован</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="inLibrary"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <div className="flex flex-row items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="font-normal">Показывать в общем списке документов</FormLabel>
              </div>
              <p className="text-[0.8rem] text-muted-foreground">
                Выключите для файлов, которые нужны только внутри новости — например информационная
                карта турнира. Файл останется доступен по прямой ссылке.
              </p>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={submitDisabled}>
          {isSaving
            ? "Сохраняем…"
            : uploadWidget.status === "uploading"
              ? "Загружаем файл…"
              : props.mode === "create"
                ? "Создать"
                : "Сохранить"}
        </Button>
      </form>
    </Form>
  );

  if (props.bare) {
    return formElement;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {props.mode === "create" ? "Новый документ" : "Редактирование документа"}
        </CardTitle>
      </CardHeader>
      <CardContent>{formElement}</CardContent>
      <UnsavedChangesDialog blocker={blocker} />
    </Card>
  );
}
