import type { CSSProperties } from "react";
import { Briefcase, ShieldCheck, UserRound, Users, type LucideIcon } from "lucide-react";
import {
  STRUCTURE_BOARD_CAPTION,
  STRUCTURE_NODES,
  structureLevel,
  type StructureNode,
  type StructureNodeId,
} from "@/lib/federation-structure";

type Node = StructureNode & { id: StructureNodeId };

/**
 * Соединительные линии (только lg+): псевдоэлементы с border, без SVG и JS.
 * Сетка с зазором 1.5rem (gap-6): LINE_UP — вертикаль на всю щель до карточки
 * выше в той же колонке; LINE_UP_HALF + LINE_BRANCH_* — развилка: полщели
 * вверх и горизонталь до центра средней колонки, где её пересекает вертикаль
 * той же щели. У вице-президентов это вертикаль Президент → Аппарат, у КРО —
 * Общее собрание → Президент; у КРО линии пунктирные, как и рамка карточки:
 * он избирается Общим собранием и Правлению не подчиняется.
 */
const LINE_UP =
  "lg:before:absolute lg:before:content-[''] lg:before:left-1/2 lg:before:-top-6 lg:before:h-6 lg:before:border-l lg:before:border-brand-blue/30";
const LINE_UP_HALF =
  "lg:before:absolute lg:before:content-[''] lg:before:left-1/2 lg:before:-top-3 lg:before:h-3 lg:before:border-l lg:before:border-brand-blue/30";
const LINE_UP_HALF_DASHED =
  "lg:before:absolute lg:before:content-[''] lg:before:left-1/2 lg:before:-top-3 lg:before:h-3 lg:before:border-l lg:before:border-dashed lg:before:border-brand-blue/30";
const LINE_BRANCH_RIGHT =
  "lg:after:absolute lg:after:content-[''] lg:after:-top-3 lg:after:left-1/2 lg:after:w-[calc(100%+1.5rem)] lg:after:border-t lg:after:border-brand-blue/30";
const LINE_BRANCH_RIGHT_DASHED =
  "lg:after:absolute lg:after:content-[''] lg:after:-top-3 lg:after:left-1/2 lg:after:w-[calc(100%+1.5rem)] lg:after:border-t lg:after:border-dashed lg:after:border-brand-blue/30";
const LINE_BRANCH_LEFT =
  "lg:after:absolute lg:after:content-[''] lg:after:-top-3 lg:after:right-1/2 lg:after:w-[calc(100%+1.5rem)] lg:after:border-t lg:after:border-brand-blue/30";

/**
 * Шесть членов Правления — братья с общим `parent`, поэтому вертикали от
 * карточки к карточке им не годятся: они читались бы как подчинение одного
 * члена Правления другому. Вместо цепочки — спина.
 *
 * GUTTER_* сдвигает карточку внутрь колонки на 1.5rem, освобождая жёлоб у
 * внешнего края (у левой колонки слева, у правой справа). Посередине жёлоба
 * (0.75rem от кромки `li`) идёт SPINE_* — одна вертикаль от карточки
 * вице-президента вниз до последнего члена Правления. Она собрана из
 * сегментов: `::before` каждой карточки начинается на -1.5rem (нижняя кромка
 * карточки выше) и идёт на всю высоту `li`, сегменты стыкуются встык.
 * У последней карточки колонки сегмент обрезан на её отводе (SPINE_*_END) —
 * хвоста вниз нет.
 *
 * STUB_* — короткий горизонтальный отвод от спины в карточку, шириной ровно
 * в полжёлоба. Его вертикаль — середина первой строки текста карточки:
 * 1px рамки + 0.75rem верхнего паддинга (py-3) + половина строки eyebrow
 * (font-size 11px, line-height наследуется от preflight html{line-height:1.5}
 * → 16.5px) = 1 + 12 + 8.25 = 21.25px.
 */
const GUTTER_LEFT = "lg:pl-6";
const GUTTER_RIGHT = "lg:pl-0 lg:pr-6";
const SPINE_LEFT =
  "lg:before:absolute lg:before:content-[''] lg:before:left-3 lg:before:-top-6 lg:before:h-[calc(100%+1.5rem)] lg:before:border-l lg:before:border-brand-blue/30";
const SPINE_LEFT_END =
  "lg:before:absolute lg:before:content-[''] lg:before:left-3 lg:before:-top-6 lg:before:h-[calc(1.5rem+21px)] lg:before:border-l lg:before:border-brand-blue/30";
const STUB_LEFT =
  "lg:after:absolute lg:after:content-[''] lg:after:left-3 lg:after:top-[21px] lg:after:w-3 lg:after:border-t lg:after:border-brand-blue/30";
const SPINE_RIGHT =
  "lg:before:absolute lg:before:content-[''] lg:before:right-3 lg:before:-top-6 lg:before:h-[calc(100%+1.5rem)] lg:before:border-l lg:before:border-brand-blue/30";
const SPINE_RIGHT_END =
  "lg:before:absolute lg:before:content-[''] lg:before:right-3 lg:before:-top-6 lg:before:h-[calc(1.5rem+21px)] lg:before:border-l lg:before:border-brand-blue/30";
const STUB_RIGHT =
  "lg:after:absolute lg:after:content-[''] lg:after:right-3 lg:after:top-[21px] lg:after:w-3 lg:after:border-t lg:after:border-brand-blue/30";

/**
 * Размещение узлов в сетке lg+ (колонка/строка), горизонтальный отступ на lg
 * и линии — представление, не данные. Отступ задан у всех двенадцати узлов
 * явно: останься `lg:pl-0` в базовом className `li`, он спорил бы с
 * `lg:pl-6` за одно свойство в одном варианте. Record по StructureNodeId:
 * новый узел в STRUCTURE_NODES без записи здесь не соберётся.
 */
const PLACEMENT: Record<StructureNodeId, string> = {
  assembly: "lg:col-start-2 lg:row-start-1 lg:pl-0",
  audit: `lg:col-start-1 lg:row-start-2 lg:pl-0 ${LINE_UP_HALF_DASHED} ${LINE_BRANCH_RIGHT_DASHED}`,
  president: `lg:col-start-2 lg:row-start-2 lg:pl-0 ${LINE_UP}`,
  "vp-general": `lg:col-start-1 lg:row-start-3 lg:pl-0 ${LINE_UP_HALF} ${LINE_BRANCH_RIGHT}`,
  office: `lg:col-start-2 lg:row-start-3 lg:pl-0 ${LINE_UP}`,
  "vp-sport": `lg:col-start-3 lg:row-start-3 lg:pl-0 ${LINE_UP_HALF} ${LINE_BRANCH_LEFT}`,
  facilities: `lg:col-start-1 lg:row-start-4 ${GUTTER_LEFT} ${SPINE_LEFT} ${STUB_LEFT}`,
  methodics: `lg:col-start-1 lg:row-start-5 ${GUTTER_LEFT} ${SPINE_LEFT} ${STUB_LEFT}`,
  secretary: `lg:col-start-1 lg:row-start-6 ${GUTTER_LEFT} ${SPINE_LEFT_END} ${STUB_LEFT}`,
  clubs: `lg:col-start-3 lg:row-start-4 ${GUTTER_RIGHT} ${SPINE_RIGHT} ${STUB_RIGHT}`,
  coaches: `lg:col-start-3 lg:row-start-5 ${GUTTER_RIGHT} ${SPINE_RIGHT} ${STUB_RIGHT}`,
  referees: `lg:col-start-3 lg:row-start-6 ${GUTTER_RIGHT} ${SPINE_RIGHT_END} ${STUB_RIGHT}`,
};

const ICONS: Partial<Record<StructureNodeId, LucideIcon>> = {
  assembly: Users,
  audit: ShieldCheck,
  president: UserRound,
  "vp-general": UserRound,
  "vp-sport": UserRound,
  office: Briefcase,
};

/**
 * Схема органов управления: один DOM для всех ширин — плоский <ol>, по <li>
 * на узел в порядке STRUCTURE_NODES. До lg — список с отступом слева
 * пропорционально уровню (--level, 1.25rem на уровень); с lg — сетка из трёх
 * колонок по карте PLACEMENT, она же задаёт горизонтальный отступ карточки
 * внутри колонки. Карточки без ссылок.
 */
export function FederationStructure({ className }: { className?: string }) {
  return (
    <div className={className}>
      <ol
        aria-label="Схема органов управления"
        className="space-y-3 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0"
      >
        {STRUCTURE_NODES.map((node: Node) => {
          const level = structureLevel(node.id);
          const Icon = ICONS[node.id];
          const isAudit = node.id === "audit";
          return (
            <li
              key={node.id}
              data-node={node.id}
              data-level={level}
              style={{ "--level": level } as CSSProperties}
              className={`relative pl-[calc(var(--level)*1.25rem)] ${PLACEMENT[node.id]}`}
            >
              <div
                className={`flex h-full items-start gap-3 rounded-lg border bg-background px-4 py-3 ${
                  isAudit ? "border-dashed border-brand-blue/30" : "border-brand-blue/10"
                }`}
              >
                {Icon ? (
                  <Icon className="mt-0.5 size-5 shrink-0 text-brand-blue" aria-hidden="true" />
                ) : null}
                <div className="min-w-0">
                  {node.eyebrow ? (
                    <p className="font-ui text-[11px] font-semibold tracking-wide text-brand-blue uppercase">
                      {node.eyebrow}
                    </p>
                  ) : null}
                  <p className="font-ui text-[15px] leading-snug font-medium text-foreground">
                    {node.title}
                  </p>
                  {node.summary ? (
                    <p className="mt-1 font-ui text-sm text-muted-foreground">{node.summary}</p>
                  ) : null}
                  {node.note ? (
                    <p className="mt-1 font-ui text-xs text-muted-foreground">{node.note}</p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 font-ui ui-caption">{STRUCTURE_BOARD_CAPTION}</p>
    </div>
  );
}
