import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { deletePersonPhoto } from "@/lib/federation-person-server-fn";
import { detectImageSignature, isWithinSizeLimit } from "@/lib/image-validation";

type UploadResult = { key: string; url: string };

/** Тот же транспорт, что у фото новости (NewsPhotoGallery): multipart на /api/admin/upload. */
function uploadFile(
  personId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("kind", "person-photo");
    formData.append("personId", personId);
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
        let message = "Не удалось загрузить фото";
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

/** Предварительная проверка на клиенте — та же сигнатура и лимит, что на сервере. */
async function validateImageFile(file: File): Promise<string | null> {
  if (!isWithinSizeLimit(file.size)) return "Файл больше 15 МБ";
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!detectImageSignature(head)) {
    return "Файл не похож на изображение поддерживаемого формата (jpeg/png/gif/webp)";
  }
  return null;
}

/**
 * Фото человека. Только для уже сохранённой записи: ключ объекта
 * `persons/{id}/…` требует id, на странице создания блок не показывается.
 */
export function PersonPhotoSection({
  personId,
  photoUrl,
}: {
  personId: string;
  photoUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-person", personId] });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const validationError = await validateImageFile(file);
      if (validationError) throw new Error(validationError);
      return uploadFile(personId, file, setProgress);
    },
    onSuccess: () => {
      toast.success("Фото загружено");
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить фото"),
    onSettled: () => {
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePersonPhoto({ data: personId }),
    onSuccess: () => {
      toast.success("Фото удалено");
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Не удалось удалить фото"),
  });

  const busy = uploadMutation.isPending || deleteMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Фото</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="aspect-[3/4] w-48 rounded-lg object-cover ring-1 ring-black/5"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Фото не загружено — на странице показывается заглушка.
          </p>
        )}

        {progress !== null ? <Progress value={progress} /> : null}

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadMutation.mutate(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadMutation.isPending
              ? "Загружаем…"
              : photoUrl
                ? "Заменить фото"
                : "Загрузить фото"}
          </Button>
          {photoUrl ? (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Удаляем…" : "Удалить фото"}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, GIF или WebP до 15 МБ. Новое фото заменяет прежнее.
        </p>
      </CardContent>
    </Card>
  );
}
