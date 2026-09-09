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
 * выше в той же колонке; LINE_UP_HALF + LINE_BRANCH_* — развилка от Президента
 * к вице-президентам: полщели вверх и горизонталь до центра средней колонки,
 * где её пересекает вертикаль Президент → Аппарат.
 */
const LINE_UP =
  "lg:before:absolute lg:before:content-[''] lg:before:left-1/2 lg:before:-top-6 lg:before:h-6 lg:before:border-l lg:before:border-brand-blue/30";
const LINE_UP_HALF =
  "lg:before:absolute lg:before:content-[''] lg:before:left-1/2 lg:before:-top-3 lg:before:h-3 lg:before:border-l lg:before:border-brand-blue/30";
const LINE_BRANCH_RIGHT =
  "lg:after:absolute lg:after:content-[''] lg:after:-top-3 lg:after:left-1/2 lg:after:w-[calc(100%+1.5rem)] lg:after:border-t lg:after:border-brand-blue/30";
const LINE_BRANCH_LEFT =
  "lg:after:absolute lg:after:content-[''] lg:after:-top-3 lg:after:right-1/2 lg:after:w-[calc(100%+1.5rem)] lg:after:border-t lg:after:border-brand-blue/30";

/**
 * Размещение узлов в сетке lg+ (колонка/строка) и их линии — представление,
 * не данные. Record по StructureNodeId: новый узел в STRUCTURE_NODES без
 * записи здесь не соберётся.
 */
const PLACEMENT: Record<StructureNodeId, string> = {
  assembly: "lg:col-start-2 lg:row-start-1",
  audit: "lg:col-start-1 lg:row-start-2",
  president: `lg:col-start-2 lg:row-start-2 ${LINE_UP}`,
  "vp-general": `lg:col-start-1 lg:row-start-3 ${LINE_UP_HALF} ${LINE_BRANCH_RIGHT}`,
  office: `lg:col-start-2 lg:row-start-3 ${LINE_UP}`,
  "vp-sport": `lg:col-start-3 lg:row-start-3 ${LINE_UP_HALF} ${LINE_BRANCH_LEFT}`,
  facilities: `lg:col-start-1 lg:row-start-4 ${LINE_UP}`,
  methodics: `lg:col-start-1 lg:row-start-5 ${LINE_UP}`,
  secretary: `lg:col-start-1 lg:row-start-6 ${LINE_UP}`,
  clubs: `lg:col-start-3 lg:row-start-4 ${LINE_UP}`,
  coaches: `lg:col-start-3 lg:row-start-5 ${LINE_UP}`,
  referees: `lg:col-start-3 lg:row-start-6 ${LINE_UP}`,
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
 * колонок по карте PLACEMENT. Карточки без ссылок.
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
              className={`relative pl-[calc(var(--level)*1.25rem)] lg:pl-0 ${PLACEMENT[node.id]}`}
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
      <p className="mt-4 font-ui text-sm text-muted-foreground">{STRUCTURE_BOARD_CAPTION}</p>
    </div>
  );
}
