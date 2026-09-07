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
    <section aria-label="Видео новости">
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-black/5">
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
