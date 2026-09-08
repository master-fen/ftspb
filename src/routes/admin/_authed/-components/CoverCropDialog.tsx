import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { coverCrop } from "@/lib/cover-crop";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Изменяется только выбранный локальный файл. Оригинал в хранилище не перезаписывается. */
export function CoverCropDialog({
  file,
  onClose,
  onConfirm,
}: {
  file: File | null;
  onClose: () => void;
  onConfirm: (file: File) => void;
}) {
  const [source, setSource] = useState<{ url: string; width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSource(null);
    setZoom(1);
    setX(50);
    setY(50);
    if (!file) return;
    const url = URL.createObjectURL(file);
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active) setSource({ url, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      if (active) toast.error("Не удалось открыть изображение");
    };
    image.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  const crop = source ? coverCrop(source.width, source.height, zoom, x, y) : null;
  const confirm = async () => {
    if (!source || !file || !crop) return;
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = crop.outputWidth;
      canvas.height = crop.outputHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        bitmap.close();
        throw new Error("Редактор изображения недоступен");
      }
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        bitmap,
        crop.left,
        crop.top,
        crop.width,
        crop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Не удалось сохранить кадр"))),
          "image/jpeg",
          0.9,
        ),
      );
      onConfirm(
        new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-cover.jpg`, { type: "image/jpeg" }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось подготовить обложку");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle>Кадрирование обложки</DialogTitle>
          <DialogDescription>
            Выберите область снимка. Сохранится отдельная обложка 16:9; исходное фото останется
            целым.
          </DialogDescription>
        </DialogHeader>
        <div className="relative aspect-video shrink-0 overflow-hidden rounded-lg bg-muted">
          {source && crop ? (
            <img
              src={source.url}
              alt="Предпросмотр кадрирования"
              className="absolute max-w-none"
              style={{
                width: `${(source.width / crop.width) * 100}%`,
                height: `${(source.height / crop.height) * 100}%`,
                left: `${(-crop.left / crop.width) * 100}%`,
                top: `${(-crop.top / crop.height) * 100}%`,
              }}
            />
          ) : (
            <p className="p-8">Подготовка изображения…</p>
          )}
        </div>
        {(
          [
            ["Масштаб", zoom, setZoom, 1, 3, 0.05],
            ["По горизонтали", x, setX, 0, 100, 1],
            ["По вертикали", y, setY, 0, 100, 1],
          ] as const
        ).map(([label, value, setValue, min, max, step]) => (
          <label key={label} className="flex flex-col gap-2 text-sm">
            {label}
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              disabled={busy || !source}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </label>
        ))}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" disabled={!source || busy} onClick={() => void confirm()}>
            {busy ? "Готовим…" : "Загрузить обложку"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
