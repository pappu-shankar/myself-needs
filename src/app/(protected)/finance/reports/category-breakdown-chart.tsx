"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/ui/chart-card";
import type { getIncomeExpenseReport } from "@/modules/finance";

type CategoryRow = ReturnType<typeof getIncomeExpenseReport>["categoryBreakdown"][number];

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CategoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CategoryRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-card ring-foreground/10 rounded-md px-3 py-2 text-sm shadow-md ring-1">
      <p className="tabular-nums font-semibold">{formatAmount(row.total)}</p>
      <p className="text-muted-foreground text-xs">{row.categoryName}</p>
    </div>
  );
}

export function CategoryBreakdownChart({ categories }: { categories: CategoryRow[] }) {
  const sorted = [...categories].sort((a, b) => a.total - b.total);
  const height = Math.max(160, sorted.length * 36 + 32);

  return (
    <ChartCard
      title="Spend by category"
      description="Expense transactions in the same window as the trend above."
      tableData={categories}
      tableColumns={[
        { key: "categoryName", label: "Category", render: (r) => r.categoryName },
        { key: "total", label: "Total", align: "right", render: (r) => formatAmount(r.total) },
      ]}
      emptyTitle="No expenses yet"
      emptyDescription="Log some expense transactions to see this breakdown."
    >
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 8, right: 24, bottom: 0, left: 8 }}
          >
            <CartesianGrid stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="categoryName"
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={100}
            />
            <Tooltip content={<CategoryTooltip />} cursor={{ fill: "var(--muted)" }} />
            <Bar
              dataKey="total"
              fill="var(--primary)"
              radius={[0, 4, 4, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
