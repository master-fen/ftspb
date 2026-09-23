import type { NewsCardItem } from "@/lib/types/news";
import { NewsCoverPlaceholder } from "./NewsCoverPlaceholder";
import { NewsImage } from "./NewsImage";

/**
 * Обложка карточки новости — одно определение на все площадки. Раньше эта
 * разметка лежала в трёх местах (`NewsListCard`, `NewsCard`, вручную
 * продублированная в `LatestNewsSection`); правило «маленькая обложка» одно
 * на всех, и строку классов роли в третий файл не копируют
 * (`docs/style-rules.md`, «Запрещено»).
 *
 * Площадку выбирает `variant`; обёртку с пропорцией слота (`aspect-[4/3]`,
 * `aspect-square`, `md:contain-size` у героя) по-прежнему держит сама
 * карточка — здесь только картинка.
 *
 * Маленькая обложка (`item.coverSmall`, решение сервера) показывается целиком
 * и по центру: у картинки нет ни `h-full`, ни `w-full`, только ограничения
 * сверху, поэтому она не увеличивается выше своего размера и уменьшается лишь
 * когда не влезает (миниатюра 84×84). Фон — поверхность самой карточки: у
 * корня каждой из трёх карточек уже стоит `bg-card-surface`, область обложки
 * прозрачна, своего цвета здесь не вводится.
 *
 * Наведение (подъём карточки и увеличение фото) не меняется — это отдельное
 * поведение карточки новости, `docs/style-rules.md`.
 */
type Variant = "list" | "hero" | "thumb";

const COVER_CLASS: Record<Variant, string> = {
  list: "h-full w-full object-cover object-[50%_25%] transition-transform duration-500 group-hover:scale-[1.03]",
  hero: "h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]",
  thumb: "h-full w-full object-cover object-[50%_25%]",
};

const SMALL_CLASS: Record<Variant, string> = {
  list: "max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]",
  hero: "max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]",
  thumb: "max-h-full max-w-full object-contain",
};

export function NewsCardCover({
  item,
  variant,
  priority,
}: {
  item: NewsCardItem;
  variant: Variant;
  /** Только у «Главного»: первая карточка грузится eager. */
  priority?: boolean;
}) {
  if (!item.cover) {
    // У героя заглушка со своей подложкой, у ленты и миниатюры — без неё.
    return <NewsCoverPlaceholder withBackground={variant === "hero"} />;
  }

  const small = item.coverSmall === true;
  return (
    <NewsImage
      src={item.cover}
      // Миниатюра «Последнего» стоит рядом с заголовком той же ссылки — для
      // скринридера она декоративная.
      alt={variant === "thumb" ? "" : item.title}
      loading={priority ? "eager" : "lazy"}
      fit={small ? "natural" : "cover"}
      className={small ? SMALL_CLASS[variant] : COVER_CLASS[variant]}
    />
  );
}
