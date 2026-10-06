"use client";

import { useMemo, useState } from "react";
import type { getHoldingsWithValue } from "@/modules/finance";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { FormField } from "@/components/ui/form-field";

type Holding = ReturnType<typeof getHoldingsWithValue>[number];

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(rate: number | null) {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

const BASIS_LABEL = {
  valuation: "market",
  accrual: "accrued est.",
  balance: "balance",
  net_invested: "net invested",
} as const;

const STANDALONE = "__standalone__";
const ALL = "__all__";

function typeLabel(type: string) {
  return type.replace(/_/g, " ");
}

export function HoldingsTable({
  holdings,
  goalNameById,
}: {
  holdings: Holding[];
  goalNameById: Map<number, string>;
}) {
  const [accountFilter, setAccountFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);

  const accountOptions = useMemo(() => {
    const names = new Set(
      holdings.map((h) => h.accountName).filter((n): n is string => n !== null),
    );
    return Array.from(names).sort();
  }, [holdings]);

  const typeOptions = useMemo(
    () => Array.from(new Set(holdings.map((h) => h.type))).sort(),
    [holdings],
  );

  const hasStandalone = holdings.some((h) => h.accountName === null);

  const filtered = useMemo(
    () =>
      holdings.filter((h) => {
        const accountMatch =
          accountFilter === ALL ||
          (accountFilter === STANDALONE ? h.accountName === null : h.accountName === accountFilter);
        const typeMatch = typeFilter === ALL || h.type === typeFilter;
        return accountMatch && typeMatch;
      }),
    [holdings, accountFilter, typeFilter],
  );

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, h) => sum + h.currentValue, 0),
    [filtered],
  );

  const columns: DataTableColumnDef<Holding>[] = useMemo(
    () => [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "type",
        header: "Type",
        meta: { width: "160px" },
        cell: ({ row }) => (
          <span className="text-muted-foreground capitalize">{typeLabel(row.original.type)}</span>
        ),
      },
      {
        id: "account",
        header: "Account",
        meta: { width: "160px" },
        cell: ({ row }) => row.original.accountName ?? "Standalone",
      },
      {
        id: "goal",
        header: "Goal",
        meta: { width: "140px" },
        cell: ({ row }) => {
          const goalId = row.original.linkedGoalId;
          return (
            <span className="text-muted-foreground">
              {goalId ? (goalNameById.get(goalId) ?? "—") : "—"}
            </span>
          );
        },
      },
      {
        id: "currentValue",
        header: "Current value",
        meta: { align: "right", width: "200px" },
        cell: ({ row }) => {
          const h = row.original;
          if (h.missing === "units") return <span className="text-destructive">Add units</span>;
          if (h.missing === "price")
            return <span className="text-muted-foreground">No price yet</span>;
          return (
            <>
              {formatAmount(h.currentValue)}
              <span className="text-muted-foreground ml-1 text-xs">
                ({h.closed ? "closed" : BASIS_LABEL[h.basis]})
              </span>
              {h.maturedOn && (
                <span className="text-destructive block text-xs">
                  Matured on {h.maturedOn} — record the payout
                </span>
              )}
            </>
          );
        },
      },
      {
        id: "xirr",
        header: "XIRR",
        meta: { align: "right", width: "90px" },
        cell: ({ row }) => formatPercent(row.original.xirr),
      },
    ],
    [goalNameById],
  );

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="Account" htmlFor="holdingsAccountFilter">
          <select
            id="holdingsAccountFilter"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="border-input bg-background h-8 w-full rounded-md border px-3 text-sm"
          >
            <option value={ALL}>All accounts</option>
            {hasStandalone && <option value={STANDALONE}>Standalone</option>}
            {accountOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Type" htmlFor="holdingsTypeFilter">
          <select
            id="holdingsTypeFilter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border-input bg-background h-8 w-full rounded-md border px-3 text-sm capitalize"
          >
            <option value={ALL}>All types</option>
            {typeOptions.map((type) => (
              <option key={type} value={type} className="capitalize">
                {typeLabel(type)}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex items-end pb-1.5 text-sm">
          <span className="text-muted-foreground">
            {filtered.length} of {holdings.length} holdings ·{" "}
            <span className="tabular-nums">{formatAmount(filteredTotal)}</span>
          </span>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No matching holdings"
        emptyDescription="Try a different account or type filter."
      />
    </div>
  );
}
