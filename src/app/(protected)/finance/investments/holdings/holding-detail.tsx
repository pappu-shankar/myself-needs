"use client";

import { useActionState, useMemo, useState } from "react";
import { todayIso } from "@/lib/dates";
import {
  addCashFlowAction,
  type AddCashFlowState,
  addValuationAction,
  type AddValuationState,
  refreshNavAction,
  type RefreshNavState,
} from "@/modules/finance/actions/domain/investments";
import { CASH_FLOW_TYPES, UNIT_PRICED_TYPES } from "@/modules/finance/types";
import type {
  getHoldingsWithValue,
  getCashFlowsForHolding,
  getValuationsForHolding,
} from "@/modules/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

type Holding = ReturnType<typeof getHoldingsWithValue>[number];
type CashFlow = ReturnType<typeof getCashFlowsForHolding>[number];
type Valuation = ReturnType<typeof getValuationsForHolding>[number];

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const cashFlowInitial: AddCashFlowState = {};
const valuationInitial: AddValuationState = {};
const refreshInitial: RefreshNavState = {};

function CashFlowSection({ holdingId, cashFlows }: { holdingId: number; cashFlows: CashFlow[] }) {
  const [state, formAction, isPending] = useActionState(addCashFlowAction, cashFlowInitial);

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">Cash flows</h3>
      {cashFlows.length === 0 ? (
        <p className="text-muted-foreground mb-3 text-sm">No cash flows logged yet.</p>
      ) : (
        <Table className="mb-3">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cashFlows.map((cf) => (
              <TableRow key={cf.id}>
                <TableCell className="tabular-nums">{cf.date}</TableCell>
                <TableCell className="text-muted-foreground capitalize">{cf.flowType}</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${cf.amount < 0 ? "" : "text-destructive"}`}
                >
                  {cf.amount < 0 ? "in " : "out "}
                  {formatAmount(Math.abs(cf.amount))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <form action={formAction} className="grid grid-cols-1 items-start gap-3 sm:grid-cols-4">
        <input type="hidden" name="holdingId" value={holdingId} />
        <FormField label="Date" htmlFor={`cf-date-${holdingId}`}>
          <Input type="date" name="date" required defaultValue={todayIso()} />
        </FormField>
        <FormField
          label="Amount"
          htmlFor={`cf-amount-${holdingId}`}
          hint="Negative = money in, positive = money out"
        >
          <Input type="number" step="any" name="amount" required className="tabular-nums" />
        </FormField>
        <FormField label="Flow type" htmlFor={`cf-type-${holdingId}`}>
          <select
            name="flowType"
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            {CASH_FLOW_TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </FormField>
        <FormFieldAction label="Add cash flow">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add cash flow"}
          </Button>
        </FormFieldAction>
        {state.error && (
          <p role="alert" className="text-destructive text-sm sm:col-span-4">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}

function ValuationSection({
  holdingId,
  valuations,
  externalCode,
}: {
  holdingId: number;
  valuations: Valuation[];
  externalCode: string | null;
}) {
  const [state, formAction, isPending] = useActionState(addValuationAction, valuationInitial);
  const [refreshState, refreshAction, isRefreshing] = useActionState(
    refreshNavAction,
    refreshInitial,
  );

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">Valuations</h3>
        {externalCode && (
          <form action={refreshAction}>
            <input type="hidden" name="holdingId" value={holdingId} />
            <Button type="submit" variant="outline" size="sm" disabled={isRefreshing}>
              {isRefreshing ? "Refreshing…" : "Refresh NAV"}
            </Button>
          </form>
        )}
      </div>
      {refreshState.error && (
        <p role="alert" className="text-destructive mb-2 text-sm">
          {refreshState.error}
        </p>
      )}

      {valuations.length === 0 ? (
        <p className="text-muted-foreground mb-3 text-sm">No valuations recorded yet.</p>
      ) : (
        <Table className="mb-3">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Price / unit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {valuations.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="tabular-nums">{v.date}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatAmount(v.pricePerUnit)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <form action={formAction} className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
        <input type="hidden" name="holdingId" value={holdingId} />
        <FormField label="Date" htmlFor={`val-date-${holdingId}`}>
          <Input type="date" name="date" required defaultValue={todayIso()} />
        </FormField>
        <FormField label="Price / unit" htmlFor={`val-price-${holdingId}`}>
          <Input type="number" step="any" name="pricePerUnit" required className="tabular-nums" />
        </FormField>
        <FormFieldAction label="Add valuation">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add valuation"}
          </Button>
        </FormFieldAction>
        {state.error && (
          <p role="alert" className="text-destructive text-sm sm:col-span-3">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}

export function HoldingDetail({
  holdings,
  cashFlowsByHolding,
  valuationsByHolding,
}: {
  holdings: Holding[];
  cashFlowsByHolding: Record<number, CashFlow[]>;
  valuationsByHolding: Record<number, Valuation[]>;
}) {
  const [selectedId, setSelectedId] = useState<number | undefined>(holdings[0]?.id);
  const holding = useMemo(() => holdings.find((h) => h.id === selectedId), [holdings, selectedId]);

  const groupedByAccount = useMemo(() => {
    const groups = new Map<string, Holding[]>();
    for (const h of holdings) {
      const key = h.accountName ?? "Standalone";
      const group = groups.get(key);
      if (group) group.push(h);
      else groups.set(key, [h]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) =>
      a === "Standalone" ? 1 : b === "Standalone" ? -1 : a.localeCompare(b),
    );
  }, [holdings]);

  if (holdings.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Holding detail</CardTitle>
      </CardHeader>
      <CardContent>
        <FormField label="Holding" htmlFor="holdingPicker" className="mb-4">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="border-input bg-background h-8 w-full rounded-md border px-3 text-sm sm:w-auto"
          >
            {groupedByAccount.map(([accountName, group]) => (
              <optgroup key={accountName} label={accountName}>
                {group.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </FormField>

        {holding && (
          <>
            {UNIT_PRICED_TYPES.has(holding.type) ? (
              <ValuationSection
                holdingId={holding.id}
                valuations={valuationsByHolding[holding.id] ?? []}
                externalCode={holding.externalCode}
              />
            ) : null}
            <div className={UNIT_PRICED_TYPES.has(holding.type) ? "mt-6" : ""}>
              <CashFlowSection
                holdingId={holding.id}
                cashFlows={cashFlowsByHolding[holding.id] ?? []}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
