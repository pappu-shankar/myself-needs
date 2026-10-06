"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/ui/chart-card";
import type { EffortHistogramBin, WeeklyEffort } from "@/modules/health/engine/effort";
import { AXIS_LINE, AXIS_TICK, PointTooltip, shortDate, yAxisLabel } from "./chart-style";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function EffortCharts({
  histogram,
  weekly,
}: {
  histogram: EffortHistogramBin[];
  weekly: WeeklyEffort[];
}) {
  const bins = histogram.map((b) => ({ ...b, label: String(b.bucket), share: b.pct * 100 }));
  const hasBins = bins.some((b) => b.count > 0);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard
        title="Reps in reserve"
        description="Share of rated working sets by RIR. 0 means you could not have done another rep."
        tableData={hasBins ? bins : []}
        tableColumns={[
          { key: "rir", label: "RIR", render: (b) => b.label },
          { key: "n", label: "Sets", align: "right", render: (b) => b.count },
          { key: "p", label: "Share", align: "right", render: (b) => pct(b.pct) },
        ]}
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={false}
                label={{
                  value: "Reps in reserve",
                  position: "insideBottom",
                  offset: -12,
                  fill: "var(--muted-foreground)",
                  fontSize: 12,
                }}
              />
              <YAxis
                tickFormatter={(v: number) => `${v}%`}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={48}
                domain={[0, 100]}
                label={yAxisLabel("% of sets")}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                content={
                  <PointTooltip<(typeof bins)[number]>
                    render={(b) => (
                      <>
                        <p className="font-semibold">
                          {b.count} sets ({pct(b.pct)})
                        </p>
                        <p className="text-muted-foreground text-xs">RIR {b.label}</p>
                      </>
                    )}
                  />
                }
              />
              <Bar
                dataKey="share"
                fill="var(--chart-1)"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Average RIR by week"
        description="Weeks with at least 2 rated sets. Lower means harder."
        tableData={weekly}
        tableColumns={[
          { key: "w", label: "Week of", render: (w) => w.weekStart },
          { key: "r", label: "Avg RIR", align: "right", render: (w) => w.avgRir },
          { key: "n", label: "Rated sets", align: "right", render: (w) => w.rated },
          { key: "s", label: "Sets", align: "right", render: (w) => w.sets },
        ]}
        emptyTitle="Not enough rated weeks"
        emptyDescription="Rate at least two sets in a week to see a trend."
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weekly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="weekStart"
                tickFormatter={shortDate}
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={false}
                minTickGap={32}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={40}
                domain={[0, "auto"]}
                label={yAxisLabel("RIR")}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={
                  <PointTooltip<WeeklyEffort>
                    render={(w) => (
                      <>
                        <p className="font-semibold">RIR {w.avgRir}</p>
                        <p className="text-muted-foreground text-xs">
                          Week of {w.weekStart} · {w.rated} rated of {w.sets} sets
                        </p>
                      </>
                    )}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="avgRir"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--primary)" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
