"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/ui/chart-card";
import { formatMoney, toMajor, toMinor } from "@/lib/format";
import type { getIncomeExpenseReport } from "@/modules/finance";

type CategoryEntry = ReturnType<typeof getIncomeExpenseReport>["categoryBreakdown"][number];
type CategoryRow = { categoryId: number; categoryName: string; total: number; complete: boolean };

function CategoryTooltip({
  active,
  payload,
  currency,
}: {
  currency: string;
  active?: boolean;
  payload?: { payload: CategoryRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-card ring-foreground/10 rounded-md px-3 py-2 text-sm shadow-md ring-1">
      <p className="tabular-nums font-semibold">
        {formatMoney({ minor: toMinor(row.total, currency), currency })}
      </p>
      <p className="text-muted-foreground text-xs">{row.categoryName}</p>
    </div>
  );
}

/** Totals arrive already converted to `baseCurrency`; the chart needs plain
 * major-unit numbers, the table and tooltip format through `formatMoney`. */
export function CategoryBreakdownChart({
  categories,
  baseCurrency,
}: {
  categories: CategoryEntry[];
  baseCurrency: string;
}) {
  const rows: CategoryRow[] = categories.map((c) => ({
    categoryId: c.categoryId,
    categoryName: c.categoryName,
    total: toMajor(c.total.baseMinor, baseCurrency),
    complete: c.total.complete,
  }));
  const incomplete = rows.some((r) => !r.complete);
  const sorted = [...rows].sort((a, b) => a.total - b.total);
  const height = Math.max(160, sorted.length * 36 + 32);

  return (
    <ChartCard
      title="Spend by category"
      description={`Expense transactions in the same window as the trend above, in ${baseCurrency}.`}
      tableData={rows}
      tableColumns={[
        { key: "categoryName", label: "Category", render: (r) => r.categoryName },
        {
          key: "total",
          label: "Total",
          align: "right",
          render: (r) =>
            formatMoney({ minor: toMinor(r.total, baseCurrency), currency: baseCurrency }),
        },
      ]}
      emptyTitle="No expenses yet"
      emptyDescription="Log some expense transactions to see this breakdown."
    >
      {incomplete && (
        <p className="text-muted-foreground mb-2 text-xs">
          Some categories exclude a currency with no exchange rate, so those totals are understated.
        </p>
      )}
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
            <Tooltip
              content={<CategoryTooltip currency={baseCurrency} />}
              cursor={{ fill: "var(--muted)" }}
            />
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
