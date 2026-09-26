"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/ui/chart-card";
import type { getNetWorthTrend } from "@/modules/finance";

type NetWorthPoint = ReturnType<typeof getNetWorthTrend>[number];

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMonthLabel(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function NetWorthTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: NetWorthPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-card ring-foreground/10 rounded-md px-3 py-2 text-sm shadow-md ring-1">
      <p className="tabular-nums font-semibold">{formatAmount(point.netWorth)}</p>
      <p className="text-muted-foreground text-xs">{formatMonthLabel(point.month)}</p>
    </div>
  );
}

export function NetWorthChart({ points }: { points: NetWorthPoint[] }) {
  return (
    <ChartCard
      title="Net worth trend"
      description="Assets minus liabilities, computed fresh each month — not a stored snapshot."
      tableData={points}
      tableColumns={[
        { key: "month", label: "Month", render: (p) => formatMonthLabel(p.month) },
        {
          key: "netWorth",
          label: "Net worth",
          align: "right",
          render: (p) => formatAmount(p.netWorth),
        },
      ]}
      emptyTitle="No net worth history yet"
      emptyDescription="Add accounts and transactions to see your trend."
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthLabel}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip content={<NetWorthTooltip />} cursor={{ stroke: "var(--border)" }} />
            <Line
              type="monotone"
              dataKey="netWorth"
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
