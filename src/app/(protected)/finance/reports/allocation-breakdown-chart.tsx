"use client";

import { ChartCard } from "@/components/ui/chart-card";
import type { getCurrentAllocation } from "@/modules/finance";

type AllocationRow = ReturnType<typeof getCurrentAllocation>[number];

const CHART_SLOTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];
const MAX_SLOTS = CHART_SLOTS.length;

const CLASS_LABELS: Record<string, string> = {
  cash: "Cash",
  equity: "Equity",
  intl_equity: "International equity",
  mutual_fund_domestic: "Mutual fund (domestic)",
  mutual_fund_intl: "Mutual fund (international)",
  bond: "Bonds",
  gold: "Gold",
  fd: "Fixed deposits",
  rd: "Recurring deposits",
  chit_fund: "Chit funds",
  govt_scheme: "Government schemes",
  other: "Other",
};

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Segment {
  assetClass: string;
  value: number;
  percentOfNetWorth: number | null;
}

function foldIntoSlots(allocation: AllocationRow[]): Segment[] {
  const shown = allocation.slice(0, MAX_SLOTS - 1);
  const rest = allocation.slice(MAX_SLOTS - 1);
  if (rest.length === 0) return shown;
  const otherValue = rest.reduce((sum, r) => sum + r.value, 0);
  const otherPercent = rest.some((r) => r.percentOfNetWorth === null)
    ? null
    : rest.reduce((sum, r) => sum + (r.percentOfNetWorth ?? 0), 0);
  return [...shown, { assetClass: "other", value: otherValue, percentOfNetWorth: otherPercent }];
}

/**
 * Part-to-whole rides on a single stacked bar per the dataviz skill (donut
 * stays deprioritized) — built in plain flexbox rather than forced through
 * Recharts' stacked-bar model, which has no native inter-segment gap.
 * Up to `MAX_SLOTS` classes get a categorical color; the rest fold into
 * "Other" so the fixed adjacent-pair CVD-safe hue order never gets a 9th
 * generated hue.
 */
export function AllocationBreakdownChart({ allocation }: { allocation: AllocationRow[] }) {
  const segments = foldIntoSlots(allocation);
  const netWorthPositive = allocation.length === 0 || allocation[0].percentOfNetWorth !== null;

  return (
    <ChartCard
      title="Current allocation"
      description="Every account and holding, as a share of net worth."
      tableData={allocation}
      tableColumns={[
        {
          key: "assetClass",
          label: "Asset class",
          render: (r) => CLASS_LABELS[r.assetClass] ?? r.assetClass,
        },
        { key: "value", label: "Value", align: "right", render: (r) => formatAmount(r.value) },
        {
          key: "percent",
          label: "% of net worth",
          align: "right",
          render: (r) =>
            r.percentOfNetWorth === null ? "—" : `${r.percentOfNetWorth.toFixed(1)}%`,
        },
      ]}
      emptyTitle="Nothing to allocate yet"
      emptyDescription="Add accounts or investment holdings to see your allocation."
    >
      {!netWorthPositive && (
        <p className="text-muted-foreground mb-4 text-sm">
          Net worth is currently zero or negative, so a share-of-net-worth breakdown isn&apos;t
          meaningful yet — values below are still exact.
        </p>
      )}
      {netWorthPositive && (
        <div className="flex h-8 gap-0.5 overflow-hidden rounded-md">
          {segments.map((s, i) => (
            <div
              key={s.assetClass}
              style={{
                width: `${Math.max(0, s.percentOfNetWorth ?? 0)}%`,
                backgroundColor: CHART_SLOTS[i % MAX_SLOTS],
              }}
              title={`${CLASS_LABELS[s.assetClass] ?? s.assetClass}: ${(s.percentOfNetWorth ?? 0).toFixed(1)}%`}
            />
          ))}
        </div>
      )}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {segments.map((s, i) => (
          <li key={s.assetClass} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: CHART_SLOTS[i % MAX_SLOTS] }}
              aria-hidden="true"
            />
            <span>{CLASS_LABELS[s.assetClass] ?? s.assetClass}</span>
            <span className="text-muted-foreground tabular-nums">
              {s.percentOfNetWorth === null
                ? formatAmount(s.value)
                : `${s.percentOfNetWorth.toFixed(1)}%`}
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}
