import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, LayoutTemplate, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFeaturedNews, saveFeaturedNews } from "@/lib/news-featured-server-fn";
import { useUnsavedChangesBlocker } from "../-hooks/use-unsaved-changes-blocker";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

export function FeaturedNewsManager() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["admin-featured"], queryFn: () => getFeaturedNews() });
  const [draft, setDraft] = useState<{ ids: string[]; expected: string } | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const ids = draft?.ids ?? query.data?.selected ?? [];
  const candidates =
    query.data?.items.filter(
      (item) =>
        !ids.includes(item.id) && item.title.toLowerCase().includes(search.trim().toLowerCase()),
    ) ?? [];
  const blocker = useUnsavedChangesBlocker(draft !== null, true);
  const change = (next: string[]) =>
    setDraft({ ids: next, expected: draft?.expected ?? query.data!.expected });
  const mutation = useMutation({
    mutationFn: () => saveFeaturedNews({ data: draft! }),
    onSuccess: async () => {
      await Promise.all([query.refetch(), client.invalidateQueries({ queryKey: ["admin-news"] })]);
      setDraft(null);
      setEditing(false);
      toast.success("Главные новости обновлены");
    },
    onError: (error) => toast.error(error.message || "Не удалось сохранить главные новости"),
  });
  return (
    <section className="rounded-xl border bg-card p-5" id="featured-news">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <LayoutTemplate className="h-5 w-5" />
            Главные новости
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Большая карточка и две малые на первом экране сайта.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setEditing(!editing)}
          disabled={mutation.isPending}
        >
          {editing ? "Скрыть подбор новостей" : "Изменить подборку"}
        </Button>
      </div>
      {query.isError ? (
        <div className="text-sm text-destructive">
          Не удалось загрузить подборку.{" "}
          <Button variant="outline" onClick={() => query.refetch()}>
            Повторить
          </Button>
        </div>
      ) : query.isPending ? (
        <p>Загрузка…</p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr]">
            {[0, 1, 2].map((position) => {
              const item = query.data.items.find((r) => r.id === ids[position]);
              return (
                <div key={position} className="min-w-0 rounded-lg border bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {position === 0 ? "1 · Большая карточка" : `${position + 1} · Малая карточка`}
                  </p>
                  {item ? (
                    <>
                      <div className="mb-3 flex gap-3">
                        {item.cover ? (
                          <img src={item.cover} alt="" className="h-16 w-20 rounded object-cover" />
                        ) : (
                          <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded bg-muted text-xs">
                            Без фото
                          </div>
                        )}
                        <p className="text-sm font-medium leading-snug">{item.title}</p>
                      </div>
                      {editing ? (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label={`Переместить новость ${position + 1} выше`}
                            disabled={position === 0 || mutation.isPending}
                            onClick={() => {
                              const next = [...ids];
                              [next[position - 1], next[position]] = [
                                next[position],
                                next[position - 1],
                              ];
                              change(next);
                            }}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label={`Переместить новость ${position + 1} ниже`}
                            disabled={position >= ids.length - 1 || mutation.isPending}
                            onClick={() => {
                              const next = [...ids];
                              [next[position + 1], next[position]] = [
                                next[position],
                                next[position + 1],
                              ];
                              change(next);
                            }}
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={mutation.isPending}
                            onClick={() => change(ids.filter((id) => id !== item.id))}
                          >
                            <X className="h-4 w-4" />
                            Убрать
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="py-4 text-sm text-muted-foreground">Свободная позиция</p>
                  )}
                </div>
              );
            })}
          </div>
          {editing ? (
            <div className="mt-4 space-y-3">
              <Input
                aria-label="Поиск главной новости"
                placeholder="Найти опубликованную новость…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                {candidates.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Новостей по этому запросу нет.
                  </p>
                ) : null}
                {candidates.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 border-b p-3 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.date.split("-").reverse().join(".")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ids.length >= 3 || mutation.isPending}
                      onClick={() => change([...ids, r.id])}
                    >
                      Выбрать
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Чтобы заменить карточку, уберите её из подборки и выберите новость ниже. Можно
                оставить меньше трёх.
              </p>
            </div>
          ) : null}
          {query.data.extraCount > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Есть лишние отметки старой подборки. При сохранении они будут сняты.
            </p>
          ) : null}
          {draft ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? "Сохраняем…" : "Сохранить подборку"}
              </Button>
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => {
                  setDraft(null);
                  void query.refetch();
                }}
              >
                Отменить изменения
              </Button>
            </div>
          ) : null}
        </>
      )}
      <UnsavedChangesDialog blocker={blocker} />
    </section>
  );
}
