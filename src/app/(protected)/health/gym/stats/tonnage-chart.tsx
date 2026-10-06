"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/ui/chart-card";
import type { WeeklyTonnage } from "@/modules/health/engine/volume";
import { AXIS_LINE, AXIS_TICK, PointTooltip, shortDate, yAxisLabel } from "./chart-style";
import type { WeightUnit } from "@/modules/health/types";
import { toDisplayWeight } from "@/modules/health/engine/units";
import { fillWeeks, formatTonnage } from "./stats-helpers";

export function TonnageChart({
  weekly,
  today,
  unit,
}: {
  weekly: WeeklyTonnage[];
  today: string;
  unit: WeightUnit;
}) {
  const kg = (n: number) => formatTonnage(n, unit);
  const data = fillWeeks(weekly, today, 26).map((w) => ({
    ...w,
    tonnageDisplay: Math.round(toDisplayWeight(w.tonnageKg, unit)),
  }));
  const any = data.some((w) => w.tonnageKg > 0);
  return (
    <ChartCard
      title="Weekly tonnage"
      description="Weight × reps over completed working sets, per Monday–Sunday week, last 26 weeks. Bodyweight is not counted."
      tableData={any ? data : []}
      tableColumns={[
        { key: "week", label: "Week of", render: (w) => w.weekStart },
        { key: "t", label: "Tonnage", align: "right", render: (w) => kg(w.tonnageKg) },
        { key: "s", label: "Sets", align: "right", render: (w) => w.sets },
        { key: "n", label: "Sessions", align: "right", render: (w) => w.sessions },
      ]}
      emptyTitle="No tonnage yet"
      emptyDescription="Finish a workout with weighted sets to see it here."
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="weekStart"
              tickFormatter={shortDate}
              tick={AXIS_TICK}
              axisLine={AXIS_LINE}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis
              tickFormatter={(v: number) => v.toLocaleString()}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={56}
              label={yAxisLabel(unit)}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              content={
                <PointTooltip<WeeklyTonnage>
                  render={(w) => (
                    <>
                      <p className="font-semibold">{kg(w.tonnageKg)}</p>
                      <p className="text-muted-foreground text-xs">
                        Week of {w.weekStart} · {w.sets} sets · {w.sessions} sessions
                      </p>
                    </>
                  )}
                />
              }
            />
            <Bar
              dataKey="tonnageDisplay"
              fill="var(--primary)"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
