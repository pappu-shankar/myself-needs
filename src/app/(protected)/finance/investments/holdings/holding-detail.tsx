"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { todayIso } from "@/lib/dates";
import { useActionSuccess } from "@/lib/use-action-success";
import {
  addCashFlowAction,
  type AddCashFlowState,
  addValuationAction,
  type AddValuationState,
  refreshNavAction,
  type RefreshNavState,
} from "@/modules/finance/actions/domain/investments";
import {
  CASH_FLOW_TYPES,
  UNIT_PRICED_TYPES,
  type CashFlowType,
  type InvestmentType,
} from "@/modules/finance/types";
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

function formatUnits(units: number) {
  return units.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

const cashFlowInitial: AddCashFlowState = {};
const valuationInitial: AddValuationState = {};
const refreshInitial: RefreshNavState = {};

/** Flows that buy or sell units — units are required for these on unit-priced holdings. */
const UNIT_FLOWS = new Set<CashFlowType>(["contribution", "redemption", "maturity"]);

function flowTypeLabel(holdingType: InvestmentType, flowType: CashFlowType) {
  // Govt schemes: `interest` = credited into the scheme (raises the balance),
  // `dividend` = interest paid out to you. See computeSchemeBalance.
  if (holdingType === "govt_scheme") {
    if (flowType === "interest") return "Interest credited";
    if (flowType === "dividend") return "Interest paid out";
  }
  if (flowType === "redemption")
    return UNIT_PRICED_TYPES.has(holdingType) ? "Sell / redeem" : "Withdrawal";
  if (flowType === "contribution")
    return UNIT_PRICED_TYPES.has(holdingType) ? "Buy / invest" : "Deposit / contribution";
  return flowType[0].toUpperCase() + flowType.slice(1);
}

function CashFlowSection({
  holdingId,
  holdingType,
  cashFlows,
}: {
  holdingId: number;
  holdingType: InvestmentType;
  cashFlows: CashFlow[];
}) {
  const [state, formAction, isPending] = useActionState(addCashFlowAction, cashFlowInitial);
  const [flowType, setFlowType] = useState<CashFlowType>("contribution");
  const formRef = useRef<HTMLFormElement>(null);
  useActionSuccess(state, () => {
    formRef.current?.reset();
    setFlowType("contribution");
  });

  const isUnitPriced = UNIT_PRICED_TYPES.has(holdingType);
  const needsUnits = isUnitPriced && UNIT_FLOWS.has(flowType);
  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

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
              {isUnitPriced && <TableHead className="text-right">Units</TableHead>}
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cashFlows.map((cf) => (
              <TableRow key={cf.id}>
                <TableCell className="tabular-nums">{cf.date}</TableCell>
                <TableCell className="text-muted-foreground">
                  {flowTypeLabel(holdingType, cf.flowType)}
                </TableCell>
                {isUnitPriced && (
                  <TableCell className="text-right tabular-nums">
                    {cf.units === null
                      ? "—"
                      : `${cf.units > 0 ? "+" : "−"}${formatUnits(Math.abs(cf.units))}`}
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {cf.amount < 0 ? "invested " : "received "}
                  {formatAmount(Math.abs(cf.amount))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <form
        ref={formRef}
        action={formAction}
        className="grid grid-cols-1 items-start gap-3 sm:grid-cols-5"
      >
        <input type="hidden" name="holdingId" value={holdingId} />
        <FormField label="Date" htmlFor={`cf-date-${holdingId}`} error={fieldError("date")}>
          <Input
            type="date"
            id={`cf-date-${holdingId}`}
            name="date"
            required
            defaultValue={todayIso()}
          />
        </FormField>
        <FormField label="Flow type" htmlFor={`cf-type-${holdingId}`}>
          <select
            id={`cf-type-${holdingId}`}
            name="flowType"
            value={flowType}
            onChange={(e) => setFlowType(e.target.value as CashFlowType)}
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            {CASH_FLOW_TYPES.map((t) => (
              <option key={t} value={t}>
                {flowTypeLabel(holdingType, t)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label="Amount (₹)"
          htmlFor={`cf-amount-${holdingId}`}
          hint={flowType === "contribution" ? "Money you put in" : "Money you received"}
          error={fieldError("amount")}
        >
          <Input
            type="number"
            id={`cf-amount-${holdingId}`}
            step="0.01"
            min="0.01"
            name="amount"
            required
            className="tabular-nums"
          />
        </FormField>
        {needsUnits ? (
          <FormField
            label="Units"
            htmlFor={`cf-units-${holdingId}`}
            hint={flowType === "contribution" ? "Units bought" : "Units sold"}
            error={fieldError("units")}
          >
            <Input
              type="number"
              id={`cf-units-${holdingId}`}
              step="any"
              min="0"
              name="units"
              required
              className="tabular-nums"
            />
          </FormField>
        ) : (
          <div className="hidden sm:block" />
        )}
        <FormFieldAction label="Add cash flow">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add cash flow"}
          </Button>
        </FormFieldAction>
        {state.error && !state.fieldErrors && (
          <p role="alert" className="text-destructive text-sm sm:col-span-5">
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
  const formRef = useRef<HTMLFormElement>(null);
  useActionSuccess(state, () => formRef.current?.reset());
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

      <form
        ref={formRef}
        action={formAction}
        className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3"
      >
        <input type="hidden" name="holdingId" value={holdingId} />
        <FormField
          label="Date"
          htmlFor={`val-date-${holdingId}`}
          hint="One price per day; re-entering a day replaces it"
          error={state.fieldErrors?.date?.[0]}
        >
          <Input
            type="date"
            id={`val-date-${holdingId}`}
            name="date"
            required
            defaultValue={todayIso()}
          />
        </FormField>
        <FormField
          label="Price / unit"
          htmlFor={`val-price-${holdingId}`}
          error={state.fieldErrors?.pricePerUnit?.[0]}
        >
          <Input
            type="number"
            id={`val-price-${holdingId}`}
            step="any"
            min="0"
            name="pricePerUnit"
            required
            className="tabular-nums"
          />
        </FormField>
        <FormFieldAction label="Add valuation">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add valuation"}
          </Button>
        </FormFieldAction>
        {state.error && !state.fieldErrors && (
          <p role="alert" className="text-destructive text-sm sm:col-span-3">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}

/** Units held and anything the value is waiting on — shown above the ledger. */
function HoldingStatus({ holding }: { holding: Holding }) {
  const isUnitPriced = UNIT_PRICED_TYPES.has(holding.type);
  const notes: { text: string; tone: "warning" | "muted" }[] = [];
  if (holding.missing === "units") {
    notes.push({
      text: "Add units: record a buy with the number of units so this holding can be valued. Until then it counts as 0 in totals.",
      tone: "warning",
    });
  } else if (holding.missing === "price") {
    notes.push({ text: "No price recorded yet — add a valuation below.", tone: "warning" });
  }
  if (holding.maturedOn) {
    notes.push({
      text: `Matured on ${holding.maturedOn} — record the payout. Valued at its maturity amount until then.`,
      tone: "warning",
    });
  }
  if (holding.closed) notes.push({ text: "Closed — fully paid out or redeemed.", tone: "muted" });

  if (!isUnitPriced && notes.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-1 text-sm">
      {isUnitPriced && holding.units !== null && (
        <p className="text-muted-foreground">
          Units held:{" "}
          <span className="text-foreground tabular-nums">{formatUnits(holding.units)}</span>
        </p>
      )}
      {notes.map((n) => (
        <p
          key={n.text}
          className={n.tone === "warning" ? "text-destructive" : "text-muted-foreground"}
        >
          {n.text}
        </p>
      ))}
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
            <HoldingStatus holding={holding} />
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
                holdingType={holding.type}
                cashFlows={cashFlowsByHolding[holding.id] ?? []}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
