import { useEffect, useRef, useState } from "react";
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
import { prepareFileForUpload } from "@/lib/image-resize";
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
import { CoverCropDialog } from "./CoverCropDialog";

type NewsPhotoGalleryProps = {
  newsId: string;
  coverPhotoId: string | null;
  onBusyChange?: (busy: boolean) => void;
};

type UploadStatus = "compressing" | "uploading" | "error" | "done";

type UploadItem = {
  id: number;
  name: string;
  progress: number;
  status: UploadStatus;
  error?: string;
  file: File;
  asCover: boolean;
  uploadedId?: string;
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

export function NewsPhotoGallery({ newsId, coverPhotoId, onBusyChange }: NewsPhotoGalleryProps) {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIdRef = useRef(0);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [loadingCover, setLoadingCover] = useState(false);
  const uploadBatchRef = useRef(false);
  const [batchPending, setBatchPending] = useState(false);

  const photosQueryKey = ["news-photos", newsId] as const;

  const photosQuery = useQuery({
    queryKey: photosQueryKey,
    queryFn: () => listNewsPhotos({ data: newsId }),
  });

  const invalidatePhotos = () => queryClient.invalidateQueries({ queryKey: photosQueryKey });
  const invalidateMedia = () =>
    Promise.all([
      invalidatePhotos(),
      queryClient.invalidateQueries({ queryKey: ["admin-news"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-featured"] }),
    ]);

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
      void invalidateMedia();
      toast.success("Обложка выбрана");
    },
    onError: () => toast.error("Не удалось назначить обложку"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePhoto({ data: id }),
    onSuccess: () => {
      setDeleteTarget(null);
      void invalidateMedia();
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

  const processAndUploadFile = async (file: File, asCover = false, retry?: UploadItem) => {
    const uploadId = retry?.id ?? ++uploadIdRef.current;
    const item: UploadItem = {
      id: uploadId,
      name: file.name,
      progress: 0,
      status: "compressing",
      file,
      asCover,
      uploadedId: retry?.uploadedId,
    };
    setUploads((prev) =>
      retry ? prev.map((u) => (u.id === uploadId ? item : u)) : [...prev, item],
    );
    try {
      if (!item.uploadedId) {
        const prepared = await prepareFileForUpload(file);
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, status: "uploading" } : u)),
        );
        const uploaded = await uploadFile(newsId, prepared.blob, prepared.filename, (progress) => {
          setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, progress } : u)));
        });
        item.uploadedId = uploaded.id;
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, uploadedId: uploaded.id } : u)),
        );
      }
      if (asCover) await setCoverPhoto({ data: { newsId, photoId: item.uploadedId! } });
      setUploads((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, status: "done", progress: 100 } : u)),
      );
      await invalidateMedia();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить файл";
      setUploads((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, status: "error", error: message } : u)),
      );
      toast.error(`${file.name}: ${message}`);
      void invalidateMedia();
    }
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    if (uploadBatchRef.current || busy || loadingCover || cropFile) {
      toast("Дождитесь завершения текущей операции");
      return;
    }
    uploadBatchRef.current = true;
    setBatchPending(true);
    try {
      for (const file of Array.from(fileList)) {
        const validationError = validateFile(file);
        if (validationError) {
          toast.error(`${file.name}: ${validationError}`);
          continue;
        }
        await processAndUploadFile(file);
      }
    } finally {
      uploadBatchRef.current = false;
      setBatchPending(false);
    }
  };

  const photos = photosQuery.data ?? [];
  const cover = photos.find((photo) => photo.id === coverPhotoId);
  const busy =
    batchPending ||
    uploads.some((u) => u.status === "compressing" || u.status === "uploading") ||
    coverMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending ||
    updateAltMutation.isPending;
  useEffect(() => {
    onBusyChange?.(busy || loadingCover || cropFile !== null);
  }, [busy, loadingCover, cropFile, onBusyChange]);
  const editCover = async () => {
    if (!cover) return;
    setLoadingCover(true);
    try {
      const response = await fetch(`/api/admin/photo-source?id=${encodeURIComponent(cover.id)}`);
      if (!response.ok) throw new Error("Не удалось открыть исходную обложку");
      const blob = await response.blob();
      if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type))
        throw new Error("Для кадрирования выберите JPEG, PNG или WebP");
      setCropFile(new File([blob], "cover-original", { type: blob.type }));
    } catch {
      toast.error(
        "Не удалось открыть исходное фото. Скачайте его и выберите через «Загрузить и кадрировать».",
      );
    } finally {
      setLoadingCover(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Изменения здесь сохраняются сразу. Обложка используется в карточках новости и на её
        странице.
      </p>
      <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[200px_minmax(0,1fr)]">
        {cover ? (
          <img
            src={cover.url}
            alt={cover.alt ?? "Текущая обложка"}
            className="aspect-video w-full rounded-lg object-cover"
          />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            Обложка не выбрана
          </div>
        )}
        <div>
          <h3 className="font-semibold">Обложка новости</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Выберите фото в галерее ниже или загрузите новое и настройте кадр.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={busy}
            onClick={() => coverInputRef.current?.click()}
          >
            Загрузить и кадрировать
          </Button>
          {cover ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy || loadingCover}
                onClick={() => void editCover()}
              >
                {loadingCover ? "Открываем…" : "Изменить кадр"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <a href={cover.url} target="_blank" rel="noreferrer">
                  Оригинал ↗
                </a>
              </Button>
            </div>
          ) : null}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const error = validateFile(file);
                if (error) toast.error(error);
                else setCropFile(file);
              }
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <h3 className="text-sm font-semibold">Галерея · {photos.length} фото</h3>

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
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          Выбрать файлы
        </Button>
        <p className="text-xs">JPEG, PNG, WebP, GIF · до 15 МБ на файл · можно выбрать несколько</p>
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
                    : u.status === "done"
                      ? "Готово"
                      : u.status === "error"
                        ? "Ошибка"
                        : `${u.progress}%`}
                </span>
              </div>
              {u.status === "error" ? (
                <div>
                  <p className="text-destructive">
                    {u.uploadedId ? "Фото загружено; не удалось назначить обложку. " : ""}
                    {u.error}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void processAndUploadFile(u.file, u.asCover, u)}
                  >
                    Повторить
                  </Button>
                </div>
              ) : (
                <Progress value={u.status === "compressing" ? 0 : u.progress} />
              )}
            </div>
          ))}
          {!busy ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setUploads((items) => items.filter((item) => item.status !== "done"))}
            >
              Скрыть завершённые
            </Button>
          ) : null}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {photos.map((photo, index) => (
            <div key={photo.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
                <img src={photo.url} alt={photo.alt ?? ""} className="h-full w-full object-cover" />
                {photo.id === coverPhotoId && (
                  <Badge className="absolute left-2 top-2">Обложка</Badge>
                )}
              </div>
              <label className="text-xs text-muted-foreground" htmlFor={`photo-alt-${photo.id}`}>
                Описание фотографии
              </label>
              <Input
                id={`photo-alt-${photo.id}`}
                defaultValue={photo.alt ?? ""}
                placeholder="Кто или что на снимке"
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
                  disabled={busy || deleteMutation.isPending || coverMutation.isPending}
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
      <CoverCropDialog
        file={cropFile}
        onClose={() => setCropFile(null)}
        onConfirm={(file) => {
          setCropFile(null);
          void processAndUploadFile(file, true);
        }}
      />
    </div>
  );
}
