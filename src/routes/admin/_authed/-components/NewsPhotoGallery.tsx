import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Star, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  EXTENSION_BY_TYPE,
  isWithinSizeLimit,
  MAX_UPLOAD_BYTES,
  type SupportedImageType,
} from "@/lib/image-validation";
import {
  deletePhoto,
  listNewsPhotos,
  reorderPhotos,
  setCoverPhoto,
  updatePhoto,
} from "@/lib/news-admin-server-fn";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

type NewsPhotoGalleryProps = {
  newsId: string;
  coverPhotoId: string | null;
};

type UploadStatus = "compressing" | "uploading" | "error";

type UploadItem = {
  id: number;
  name: string;
  progress: number;
  status: UploadStatus;
  error?: string;
};

type UploadResult = { id: string; key: string; url: string };

function isSupportedImageType(type: string): type is SupportedImageType {
  return type in EXTENSION_BY_TYPE;
}

function validateFile(file: File): string | null {
  if (!isWithinSizeLimit(file.size, MAX_UPLOAD_BYTES)) return "Файл больше 15 МБ";
  if (!isSupportedImageType(file.type)) return "Неподдерживаемый тип файла";
  return null;
}

function replaceExtension(filename: string, ext: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return `${base}.${ext}`;
}

async function readLongSide(file: Blob): Promise<number> {
  const bitmap = await createImageBitmap(file);
  const longSide = Math.max(bitmap.width, bitmap.height);
  bitmap.close();
  return longSide;
}

async function resizeToJpeg(file: Blob, longSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas недоступен в этом браузере");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось сжать изображение"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/**
 * Правило (согласовано отдельно): GIF никогда не трогаем — анимация не
 * переживёт canvas. Всё остальное (JPEG/PNG/WebP) больше 1600px по длинной
 * стороне уменьшается и перекодируется в JPEG 0.82, независимо от исходного
 * формата — один энкодер на все случаи, прозрачность PNG в жертву. Иначе —
 * отправляем как есть.
 */
async function prepareFileForUpload(file: File): Promise<{ blob: Blob; filename: string }> {
  if (file.type === "image/gif") {
    return { blob: file, filename: file.name };
  }
  const longSide = await readLongSide(file);
  if (longSide > MAX_DIMENSION) {
    const blob = await resizeToJpeg(file, MAX_DIMENSION);
    return { blob, filename: replaceExtension(file.name, "jpg") };
  }
  return { blob: file, filename: file.name };
}

function uploadFile(
  newsId: string,
  blob: Blob,
  filename: string,
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("newsId", newsId);
    formData.append("file", blob, filename);

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

function movePhoto<T extends { id: string }>(items: T[], id: string, direction: -1 | 1): T[] {
  const index = items.findIndex((item) => item.id === id);
  const swapWith = index + direction;
  if (index < 0 || swapWith < 0 || swapWith >= items.length) return items;
  const next = [...items];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  return next;
}

export function NewsPhotoGallery({ newsId, coverPhotoId }: NewsPhotoGalleryProps) {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIdRef = useRef(0);

  const photosQueryKey = ["news-photos", newsId] as const;

  const photosQuery = useQuery({
    queryKey: photosQueryKey,
    queryFn: () => listNewsPhotos({ data: newsId }),
  });

  const invalidatePhotos = () => queryClient.invalidateQueries({ queryKey: photosQueryKey });

  const updateAltMutation = useMutation({
    mutationFn: (input: { id: string; alt: string | null }) =>
      updatePhoto({ data: { id: input.id, alt: input.alt } }),
    onSuccess: invalidatePhotos,
    onError: () => toast.error("Не удалось сохранить подпись"),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => reorderPhotos({ data: { newsId, orderedIds } }),
    onSuccess: invalidatePhotos,
    onError: () => {
      toast.error("Не удалось сохранить порядок");
      // Локальный оптимистичный порядок не совпадает с базой — откатываем
      // на реальные данные, иначе пользователь решит, что всё сохранилось.
      invalidatePhotos();
    },
  });

  const coverMutation = useMutation({
    mutationFn: (photoId: string) => setCoverPhoto({ data: { newsId, photoId } }),
    onSuccess: () => {
      invalidatePhotos();
      queryClient.invalidateQueries({ queryKey: ["admin-news", newsId] });
    },
    onError: () => toast.error("Не удалось назначить обложку"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePhoto({ data: id }),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidatePhotos();
    },
    onError: () => toast.error("Не удалось удалить фото"),
  });

  const handleReorder = (id: string, direction: -1 | 1) => {
    const current = photosQuery.data ?? [];
    const next = movePhoto(current, id, direction);
    if (next === current) return;
    queryClient.setQueryData(photosQueryKey, next);
    reorderMutation.mutate(next.map((photo) => photo.id));
  };

  const processAndUploadFile = async (file: File) => {
    const uploadId = ++uploadIdRef.current;
    setUploads((prev) => [
      ...prev,
      { id: uploadId, name: file.name, progress: 0, status: "compressing" },
    ]);
    try {
      const prepared = await prepareFileForUpload(file);
      setUploads((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, status: "uploading" } : u)),
      );
      await uploadFile(newsId, prepared.blob, prepared.filename, (progress) => {
        setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, progress } : u)));
      });
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      invalidatePhotos();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить файл";
      setUploads((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, status: "error", error: message } : u)),
      );
      toast.error(`${file.name}: ${message}`);
    }
  };

  const handleFiles = (fileList: FileList | File[]) => {
    for (const file of Array.from(fileList)) {
      const validationError = validateFile(file);
      if (validationError) {
        toast.error(`${file.name}: ${validationError}`);
        continue;
      }
      void processAndUploadFile(file);
    }
  };

  const photos = photosQuery.data ?? [];

  return (
    <div className="mt-8 flex flex-col gap-4">
      <h3 className="text-sm font-medium text-foreground">Фотографии</h3>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors ${
          isDragging ? "border-primary bg-accent" : ""
        }`}
      >
        <UploadCloud className="h-6 w-6" />
        <p>Перетащите фото сюда или</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          Выбрать файлы
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <div className="flex flex-col gap-2">
          {uploads.map((u) => (
            <div key={u.id} className="flex flex-col gap-1 rounded-md border p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{u.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {u.status === "compressing"
                    ? "Сжатие…"
                    : u.status === "error"
                      ? "Ошибка"
                      : `${u.progress}%`}
                </span>
              </div>
              {u.status === "error" ? (
                <p className="text-destructive">{u.error}</p>
              ) : (
                <Progress value={u.status === "compressing" ? 0 : u.progress} />
              )}
            </div>
          ))}
        </div>
      )}

      {photosQuery.isError ? (
        <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-destructive">
          <span>Не удалось загрузить фотографии.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => photosQuery.refetch()}>
            Повторить
          </Button>
        </div>
      ) : photosQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет фотографий.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo, index) => (
            <div key={photo.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
                <img src={photo.url} alt={photo.alt ?? ""} className="h-full w-full object-cover" />
                {photo.id === coverPhotoId && (
                  <Badge className="absolute left-2 top-2">Обложка</Badge>
                )}
              </div>
              <Input
                defaultValue={photo.alt ?? ""}
                placeholder="Alt-текст"
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value !== (photo.alt ?? "")) {
                    updateAltMutation.mutate({ id: photo.id, alt: value || null });
                  }
                }}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={index === 0 || reorderMutation.isPending}
                  onClick={() => handleReorder(photo.id, -1)}
                  aria-label="Переместить выше"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={index === photos.length - 1 || reorderMutation.isPending}
                  onClick={() => handleReorder(photo.id, 1)}
                  aria-label="Переместить ниже"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={photo.id === coverPhotoId || coverMutation.isPending}
                  onClick={() => coverMutation.mutate(photo.id)}
                >
                  <Star className="h-4 w-4" />
                  Сделать обложкой
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="ml-auto"
                  onClick={() => setDeleteTarget(photo.id)}
                  aria-label="Удалить фото"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить фото?</AlertDialogTitle>
            <AlertDialogDescription>
              Фото будет удалено из галереи и из хранилища. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget);
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
