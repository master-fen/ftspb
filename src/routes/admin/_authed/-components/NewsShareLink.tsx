import { useRef, type KeyboardEvent, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isProductionHost } from "@/lib/analytics";
import {
  createNewsShareLink,
  getNewsShareLink,
  revokeNewsShareLink,
} from "@/lib/news-admin-server-fn";
import { newsShareUrl } from "@/lib/news-preview";
import { SITE_URL } from "@/lib/site";

/**
 * Начало полного адреса: на боевом хосте — канонический `SITE_URL`, локально —
 * свой origin. Признак прода — тот же, что у счётчика Метрики. На проде
 * админка и так открыта на каноническом хосте (`www` → 308, src/start.ts).
 */
function shareOrigin(): string {
  return isProductionHost(window.location.hostname) ? SITE_URL : window.location.origin;
}

/**
 * Блок «Согласование» в колонке «Публикация» редактора: ссылка на черновик
 * для согласования без входа (src/server/news-share-link.ts). Показывается
 * только у сохранённого черновика — решает родитель.
 *
 * Блок стоит внутри `<form id="news-editor">`: все кнопки — `type="button"`
 * (`Button` без `type` — submit), Enter в поле адреса гасится. Иначе форма
 * сохранилась бы вместе с выбранным «Статусом».
 */
export function NewsShareLink({
  newsId,
  saving,
  saveFirst,
}: {
  newsId: string;
  /** Идёт сохранение формы — кнопки блока ждут. */
  saving: boolean;
  /** Сохранить несохранённые правки без «Статуса», как перед предпросмотром; false — не сохранилось. */
  saveFirst: () => Promise<boolean>;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["admin-news-share-link", newsId];
  const query = useQuery({
    queryKey,
    queryFn: () => getNewsShareLink({ data: newsId }),
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // Первая ссылка: сначала правки, потом ссылка — согласующий увидит сохранённую версию.
  const create = useMutation({
    mutationFn: async () => {
      if (!(await saveFirst())) return null;
      return createNewsShareLink({ data: newsId });
    },
    onSuccess: (state) => {
      if (state) queryClient.setQueryData(queryKey, state);
    },
    onError: () => toast.error("Не удалось создать ссылку"),
  });

  const renew = useMutation({
    mutationFn: () => createNewsShareLink({ data: newsId }),
    onSuccess: (state) => {
      queryClient.setQueryData(queryKey, state);
      toast.success("Создана новая ссылка, прежняя больше не работает");
    },
    onError: () => toast.error("Не удалось создать новую ссылку"),
  });

  const revoke = useMutation({
    mutationFn: () => revokeNewsShareLink({ data: newsId }),
    onSuccess: () => {
      queryClient.setQueryData(queryKey, { kind: "none" });
      toast.success("Ссылка отозвана");
    },
    onError: () => toast.error("Не удалось отозвать ссылку"),
  });

  const busy = saving || create.isPending || renew.isPending || revoke.isPending;

  // Запись в буфер — прямо в обработчике клика: браузер требует жеста
  // пользователя, после `await` его уже нет. Не вышло — адрес выделен в поле.
  const onCopy = (url: string) => {
    const fail = () => {
      inputRef.current?.select();
      toast.error("Не удалось скопировать — адрес выделен, скопируйте его вручную");
    };
    if (!navigator.clipboard) {
      fail();
      return;
    }
    navigator.clipboard.writeText(url).then(() => toast.success("Ссылка скопирована"), fail);
  };

  const onAddressKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.preventDefault();
  };

  return (
    <div className="border-t pt-4">
      <p className="text-sm font-medium">Согласование</p>
      {query.isError ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-destructive">Не удалось загрузить ссылку.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
            Повторить
          </Button>
        </div>
      ) : query.isPending ? (
        <p className="mt-2 text-sm text-muted-foreground">Загрузка…</p>
      ) : query.data.kind === "active" ? (
        <ActiveLink
          url={newsShareUrl(shareOrigin(), newsId, query.data.token)}
          expiresOn={query.data.expiresOn}
          inputRef={inputRef}
          busy={busy}
          onCopy={onCopy}
          onAddressKeyDown={onAddressKeyDown}
          onRenew={() => renew.mutate()}
          onRevoke={() => revoke.mutate()}
        />
      ) : (
        <>
          {query.data.kind === "expired" ? (
            <p className="mt-2 text-[0.8rem] text-muted-foreground">Прежняя ссылка истекла</p>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">
            Ссылка откроет черновик без входа в админку так, как его увидят посетители. Действует 14
            дней.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            disabled={busy}
            onClick={() => create.mutate()}
          >
            <Link2 className="h-4 w-4" />
            Ссылка для согласования
          </Button>
        </>
      )}
    </div>
  );
}

function ActiveLink({
  url,
  expiresOn,
  inputRef,
  busy,
  onCopy,
  onAddressKeyDown,
  onRenew,
  onRevoke,
}: {
  url: string;
  expiresOn: string;
  inputRef: RefObject<HTMLInputElement | null>;
  busy: boolean;
  onCopy: (url: string) => void;
  onAddressKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRenew: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className="mt-2 space-y-2">
      <Input
        ref={inputRef}
        readOnly
        value={url}
        aria-label="Ссылка для согласования"
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={onAddressKeyDown}
      />
      <Button type="button" variant="outline" className="w-full" onClick={() => onCopy(url)}>
        <Copy className="h-4 w-4" />
        Скопировать
      </Button>
      <p className="text-[0.8rem] text-muted-foreground">Действует до {expiresOn}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRenew}>
          Новая ссылка
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRevoke}>
          Отозвать
        </Button>
      </div>
      <p className="text-[0.8rem] text-muted-foreground">
        «Новая ссылка» и «Отозвать» сразу отключают текущую ссылку.
      </p>
    </div>
  );
}
