import { Play } from "lucide-react";

interface NewsVideoProps {
  src: string;
  title: string;
}

/**
 * Встроенный плеер Kinescope. Сервер уже нормализует адрес до
 * https://kinescope.io/embed/<ID>, поэтому src используется как есть.
 * 16:9, адаптивная ширина, без ограничивающего sandbox.
 */
export function NewsVideo({ src, title }: NewsVideoProps) {
  return (
    <section className="mt-8 md:mt-10">
      <div className="flex items-center gap-2">
        <Play className="h-4 w-4 text-brand-orange" aria-hidden />
        <h2 className="text-sm font-bold tracking-wide text-foreground uppercase">Видео</h2>
      </div>
      <div className="mt-4 aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-black/5">
        <iframe
          src={src}
          title={`Видео: ${title}`}
          loading="lazy"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          className="h-full w-full"
        />
      </div>
    </section>
  );
}
