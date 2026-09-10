import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEventDateShort } from "@/lib/event-date";
import { listEventOptions } from "@/lib/events-server-fn";
import { NO_EVENT } from "./event-select-value";

/**
 * Выбор события для новости. Значение формы — идентификатор события либо
 * NO_EVENT; преобразование в `string | null` и обратно — в
 * event-select-value.ts (отдельный модуль, чтобы этот файл экспортировал
 * только компонент — требование react-refresh).
 *
 * Черновики показываются тоже — новость часто готовят раньше, чем публикуют
 * само событие; такие помечены «(черновик)».
 */
export function EventSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const query = useQuery({
    queryKey: ["admin-event-options"],
    queryFn: () => listEventOptions(),
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_EVENT}>Нет</SelectItem>
        {(query.data ?? []).map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {`${formatEventDateShort(option.startsOn, option.datePrecision)} ${option.startsOn.slice(0, 4)} — ${option.title}${
              option.status === "published" ? "" : " (черновик)"
            }`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
