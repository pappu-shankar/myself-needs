"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/ui/chart-card";
import { AXIS_LINE, AXIS_TICK, PointTooltip, shortDate, yAxisLabel } from "./chart-style";

export interface LoadPoint {
  date: string;
  load: number;
  ratio: number | null;
}

export function LoadCharts({ series }: { series: LoadPoint[] }) {
  const any = series.some((p) => p.load > 0);
  const ratios = series.filter((p) => p.ratio !== null);
  const topRatio = Math.max(2, ...ratios.map((p) => p.ratio ?? 0));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard
        title="Daily training load"
        description="Session time in minutes × session RPE, in arbitrary units (AU). Last 42 days."
        tableData={any ? series : []}
        tableColumns={[
          { key: "d", label: "Date", render: (p) => p.date },
          { key: "l", label: "Load (AU)", align: "right", render: (p) => p.load },
        ]}
        emptyTitle="No load yet"
        emptyDescription="Finish a workout to see its load."
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={48}
                label={yAxisLabel("AU")}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                content={
                  <PointTooltip<LoadPoint>
                    render={(p) => (
                      <>
                        <p className="font-semibold">{p.load} AU</p>
                        <p className="text-muted-foreground text-xs">{p.date}</p>
                      </>
                    )}
                  />
                }
              />
              <Bar
                dataKey="load"
                fill="var(--chart-1)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Acute:chronic ratio"
        description="Last 7 days of load ÷ last 28 days. The shaded band (0.8–1.3) is the sweet spot."
        tableData={ratios}
        tableColumns={[
          { key: "d", label: "Date", render: (p) => p.date },
          { key: "r", label: "Ratio", align: "right", render: (p) => p.ratio?.toFixed(2) ?? "—" },
        ]}
        emptyTitle="Not enough history"
        emptyDescription="A ratio needs about three weeks of training."
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <ReferenceArea y1={0.8} y2={1.3} fill="var(--chart-6)" fillOpacity={0.15} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={40}
                domain={[0, Math.ceil(topRatio * 2) / 2]}
                tickFormatter={(v: number) => v.toFixed(1)}
                label={yAxisLabel("ratio")}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={
                  <PointTooltip<LoadPoint>
                    render={(p) => (
                      <>
                        <p className="font-semibold">{p.ratio?.toFixed(2) ?? "No ratio"}</p>
                        <p className="text-muted-foreground text-xs">{p.date}</p>
                      </>
                    )}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="ratio"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
