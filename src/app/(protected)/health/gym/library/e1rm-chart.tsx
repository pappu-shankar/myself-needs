"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/ui/chart-card";
import { formatWeight, toDisplayWeight } from "@/modules/health/engine/units";
import type { ExerciseOverview } from "@/modules/health";
import type { WeightUnit } from "@/modules/health/gym-types";

type Point = ExerciseOverview["e1rmSeries"][number];

const describeSet = (p: Point, unit: WeightUnit) => `${formatWeight(p.weightKg, unit)} × ${p.reps}`;

function E1rmTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  unit: WeightUnit;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-card ring-foreground/10 rounded-md px-3 py-2 text-sm shadow-md ring-1">
      <p className="tabular-nums font-semibold">
        {describeSet(point, unit)} → {formatWeight(point.e1rmKg, unit)}
      </p>
      <p className="text-muted-foreground text-xs">{point.date}</p>
    </div>
  );
}

/** Best estimated 1RM per session over time. */
export function E1rmChart({
  points,
  formulaLabel,
  weightUnit = "kg",
}: {
  points: Point[];
  formulaLabel: string;
  weightUnit?: WeightUnit;
}) {
  const data = points.map((p) => ({ ...p, e1rmDisplay: toDisplayWeight(p.e1rmKg, weightUnit) }));
  return (
    <ChartCard
      title="Estimated 1RM"
      description={`Best set of each session, ${formulaLabel} formula.`}
      tableData={points}
      tableColumns={[
        { key: "date", label: "Date", render: (p) => p.date },
        {
          key: "set",
          label: "Best set",
          align: "right",
          render: (p) => describeSet(p, weightUnit),
        },
        {
          key: "e1rm",
          label: "e1RM",
          align: "right",
          render: (p) => formatWeight(p.e1rmKg, weightUnit),
        },
      ]}
      emptyTitle="No weight × reps history yet"
      emptyDescription="Log a few sets with a weight and 1–12 reps to see your strength trend."
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(v: number) =>
                v.toLocaleString(undefined, { maximumFractionDigits: 1 })
              }
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={48}
              label={{
                value: weightUnit,
                angle: -90,
                position: "insideLeft",
                fill: "var(--muted-foreground)",
                fontSize: 12,
              }}
            />
            <Tooltip
              content={<E1rmTooltip unit={weightUnit} />}
              cursor={{ stroke: "var(--border)" }}
            />
            <Line
              type="monotone"
              dataKey="e1rmDisplay"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={points.length < 25}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2, fill: "var(--primary)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
