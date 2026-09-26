"use client";

import { useState } from "react";
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
import { FormField } from "@/components/ui/form-field";
import { HEALTH_METRIC_TYPES, DEFAULT_UNITS, type HealthMetricType } from "@/modules/health/types";
import type { getMetricTrend } from "@/modules/health";

type MetricPoint = ReturnType<typeof getMetricTrend>[number];

const TYPE_LABELS: Record<HealthMetricType, string> = {
  weight: "Weight",
  sleep_hours: "Sleep",
  exercise_minutes: "Exercise",
  custom: "Custom",
};

const TRACKABLE_TYPES = HEALTH_METRIC_TYPES.filter((t) => t !== "custom");

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MetricPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-card ring-foreground/10 rounded-md px-3 py-2 text-sm shadow-md ring-1">
      <p className="tabular-nums font-semibold">
        {point.value} {point.unit}
      </p>
      <p className="text-muted-foreground text-xs">{point.date}</p>
    </div>
  );
}

export function MetricTrendChart({
  trendsByType,
}: {
  trendsByType: Record<HealthMetricType, MetricPoint[]>;
}) {
  const [type, setType] = useState<HealthMetricType>("weight");
  const points = trendsByType[type] ?? [];

  return (
    <ChartCard
      title="Trend"
      tableData={points}
      tableColumns={[
        { key: "date", label: "Date", render: (p) => p.date },
        {
          key: "value",
          label: "Value",
          align: "right",
          render: (p) => `${p.value ?? "—"} ${p.unit ?? ""}`,
        },
      ]}
      emptyTitle="No entries yet"
      emptyDescription="Add entries above to see a trend."
    >
      <FormField label="Metric" htmlFor="metricTrendType" className="mb-4 sm:w-48">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as HealthMetricType)}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {TRACKABLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) =>
                v.toLocaleString(undefined, { maximumFractionDigits: 1 })
              }
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={48}
              label={{
                value: DEFAULT_UNITS[type],
                angle: -90,
                position: "insideLeft",
                fill: "var(--muted-foreground)",
                fontSize: 12,
              }}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--border)" }} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2, fill: "var(--primary)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
