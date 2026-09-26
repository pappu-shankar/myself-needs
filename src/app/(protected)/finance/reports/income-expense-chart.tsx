"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/ui/chart-card";
import type { getIncomeExpenseReport } from "@/modules/finance";

type TrendPoint = ReturnType<typeof getIncomeExpenseReport>["trend"][number];

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

function IncomeExpenseTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card ring-foreground/10 rounded-md px-3 py-2 text-sm shadow-md ring-1">
      <p className="text-muted-foreground mb-1 text-xs">{label && formatMonthLabel(label)}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="tabular-nums">
          <span className={entry.dataKey === "income" ? "text-primary" : "text-destructive"}>
            {entry.dataKey === "income" ? "Income" : "Expense"}
          </span>
          : <span className="font-semibold">{formatAmount(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function IncomeExpenseChart({ trend }: { trend: TrendPoint[] }) {
  return (
    <ChartCard
      title="Income vs. expense"
      description="Monthly totals from your logged transactions."
      tableData={trend}
      tableColumns={[
        { key: "month", label: "Month", render: (p) => formatMonthLabel(p.month) },
        { key: "income", label: "Income", align: "right", render: (p) => formatAmount(p.income) },
        {
          key: "expense",
          label: "Expense",
          align: "right",
          render: (p) => formatAmount(p.expense),
        },
      ]}
      emptyTitle="No transactions yet"
      emptyDescription="Log some income and expenses to see this trend."
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
            <Tooltip content={<IncomeExpenseTooltip />} cursor={{ fill: "var(--muted)" }} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
              formatter={(v) => (v === "income" ? "Income" : "Expense")}
            />
            <Bar
              dataKey="income"
              fill="var(--primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
            <Bar
              dataKey="expense"
              fill="var(--destructive)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
