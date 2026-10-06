"use client";

import { useId, useState } from "react";
import { ChartCard } from "@/components/ui/chart-card";
import { MUSCLES, MUSCLE_LABELS, type Muscle, type Sex } from "@/modules/health/types";
import type { MuscleLevel } from "@/modules/health/engine/muscles";
import { BODY_MAP } from "./body-map-paths";

/** 5-step sequential ramp from the primary token; level 0 = neutral muscle fill.
 * Mixing into --card keeps contrast in both light and dark themes. */
const LEVEL_FILL: Record<MuscleLevel, string> = {
  0: "color-mix(in oklab, var(--muted-foreground) 22%, var(--card))",
  1: "color-mix(in oklab, var(--primary) 28%, var(--card))",
  2: "color-mix(in oklab, var(--primary) 50%, var(--card))",
  3: "color-mix(in oklab, var(--primary) 75%, var(--card))",
  4: "var(--primary)",
};
const SILHOUETTE_FILL = "color-mix(in oklab, var(--muted-foreground) 9%, var(--card))";
const LEVEL_NAMES = ["None", "Light", "Moderate", "High", "Highest"] as const;

interface BodyMapProps {
  levels: Partial<Record<Muscle, MuscleLevel>>;
  figure?: Sex;
  title: string;
  description?: string;
  /** Raw values per muscle, shown in the readout and table (e.g. weekly sets). */
  values?: Partial<Record<Muscle, number>>;
  /** Unit text for `values`, e.g. "sets". */
  valueLabel?: string;
  compact?: boolean;
  highlight?: Muscle[];
}

interface Row {
  muscle: Muscle;
  level: MuscleLevel;
  value: number | undefined;
}

function formatValue(value: number | undefined, unit?: string): string {
  if (value === undefined) return "";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${text} ${unit}` : text;
}

export function BodyMap({
  levels,
  figure = "male",
  title,
  description,
  values,
  valueLabel,
  compact = false,
  highlight = [],
}: BodyMapProps) {
  const [active, setActive] = useState<Muscle | null>(null);
  const readoutId = useId();

  const rows: Row[] = MUSCLES.map((muscle) => ({
    muscle,
    level: levels[muscle] ?? 0,
    value: values?.[muscle],
  }));
  const top = rows
    .filter((r) => r.level > 0)
    .sort((a, b) => b.level - a.level || (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 3);
  const summary = top.length
    ? `Muscle map. Most worked: ${top
        .map(
          (r) =>
            `${MUSCLE_LABELS[r.muscle]}${r.value !== undefined ? ` ${formatValue(r.value, valueLabel)}` : ""}`,
        )
        .join(", ")}.`
    : "Muscle map. No muscles worked.";

  const describe = (r: Row) =>
    `${MUSCLE_LABELS[r.muscle]} — ${r.value !== undefined ? formatValue(r.value, valueLabel) : LEVEL_NAMES[r.level]}`;
  const rowOf = (m: Muscle) => rows.find((r) => r.muscle === m)!;
  const highlighted = new Set(highlight);

  return (
    <ChartCard
      title={title}
      description={description}
      tableData={rows}
      tableColumns={[
        { key: "muscle", label: "Muscle", render: (r) => MUSCLE_LABELS[r.muscle] },
        {
          key: "level",
          label: "Level",
          align: "right",
          render: (r) => `${r.level} (${LEVEL_NAMES[r.level]})`,
        },
        {
          key: "value",
          label: valueLabel ? `Value (${valueLabel})` : "Value",
          align: "right",
          render: (r) => (r.value === undefined ? "—" : formatValue(r.value)),
        },
      ]}
    >
      <div className="flex flex-col gap-3">
        <div
          role="img"
          aria-label={summary}
          className={`mx-auto flex w-full flex-col items-center gap-4 sm:flex-row sm:justify-center ${compact ? "max-w-md" : "max-w-2xl"}`}
        >
          {(["front", "back"] as const).map((side) => {
            const view = BODY_MAP[figure][side];
            return (
              <figure key={side} className="m-0 w-full max-w-60 flex-1">
                <svg
                  viewBox={view.viewBox.join(" ")}
                  className={`h-auto w-full ${compact ? "max-h-72" : "max-h-136"}`}
                  focusable="false"
                  aria-hidden="true"
                >
                  {view.parts.map((part) => {
                    if (!part.muscle) {
                      return (
                        <g key={part.slug} fill={SILHOUETTE_FILL} stroke="var(--border)">
                          {part.paths.map((d, i) => (
                            <path key={i} d={d} strokeWidth={2} />
                          ))}
                        </g>
                      );
                    }
                    const row = rowOf(part.muscle);
                    const isActive = active === part.muscle || highlighted.has(part.muscle);
                    return (
                      <g
                        key={part.slug}
                        data-muscle={part.muscle}
                        data-level={row.level}
                        fill={LEVEL_FILL[row.level]}
                        stroke={isActive ? "var(--foreground)" : "var(--border)"}
                        strokeWidth={isActive ? 5 : 2}
                        onMouseEnter={() => setActive(part.muscle)}
                        onMouseLeave={() => setActive(null)}
                      >
                        <title>{describe(row)}</title>
                        {part.paths.map((d, i) => (
                          <path key={i} d={d} />
                        ))}
                      </g>
                    );
                  })}
                </svg>
                <figcaption className="text-muted-foreground mt-1 text-center text-xs">
                  {side === "front" ? "Front" : "Back"}
                </figcaption>
              </figure>
            );
          })}
        </div>
        <p
          id={readoutId}
          aria-live="polite"
          className="text-muted-foreground min-h-5 text-center text-sm tabular-nums"
        >
          {active ? describe(rowOf(active)) : ""}
        </p>
        <MapLegend />
        {highlight.length > 0 && (
          <p className="text-muted-foreground text-center text-xs">
            Outlined: {highlight.map((m) => MUSCLE_LABELS[m]).join(", ")}
          </p>
        )}
      </div>
    </ChartCard>
  );
}

function MapLegend() {
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
      <span>Less</span>
      {([0, 1, 2, 3, 4] as const).map((l) => (
        <span
          key={l}
          className="border-border size-4 rounded-sm border"
          style={{ backgroundColor: LEVEL_FILL[l] }}
          title={LEVEL_NAMES[l]}
        />
      ))}
      <span>More</span>
    </div>
  );
}

/** A compact list of muscle labels, e.g. "untrained this week: …". */
export function MuscleChips({ muscles, label }: { muscles: Muscle[]; label?: string }) {
  if (muscles.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label && <span className="text-muted-foreground text-sm">{label}</span>}
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {muscles.map((m) => (
          <li
            key={m}
            className="bg-muted text-foreground rounded-full px-2.5 py-0.5 text-xs font-medium"
          >
            {MUSCLE_LABELS[m]}
          </li>
        ))}
      </ul>
    </div>
  );
}
