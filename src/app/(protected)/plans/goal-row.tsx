"use client";

import { useActionState } from "react";
// Import directly from actions.ts, not the module's index.ts barrel — see
// docs/architecture/system-design.md.
import { updateGoalProgressAction, type UpdateGoalProgressState } from "@/modules/plans/actions";
import type { Goal, GoalPriority } from "@/modules/plans/types";
import { TableCell, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";

const PRIORITY_LABELS: Record<GoalPriority, string> = {
  must_have: "Must have",
  important: "Important",
  aspirational: "Aspirational",
};

/** A holding linked to this goal, as the app layer composes it from finance. */
export interface LinkedHolding {
  name: string;
  currentValueMinor: number;
  currency: string;
}

function sumByCurrency(holdings: LinkedHolding[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const holding of holdings) {
    totals.set(holding.currency, (totals.get(holding.currency) ?? 0) + holding.currentValueMinor);
  }
  return totals;
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="bg-muted h-2 w-24 overflow-hidden rounded-full">
      <div className="bg-primary h-full rounded-full" style={{ width: `${clamped}%` }} />
    </div>
  );
}

const progressInitial: UpdateGoalProgressState = {};

function ProgressForm({ goal }: { goal: Goal }) {
  const [state, formAction, isPending] = useActionState(updateGoalProgressAction, progressInitial);
  const percent = goal.progressPercent ?? 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <ProgressBar percent={percent} />
        <form action={formAction} className="flex items-center gap-1">
          <input type="hidden" name="id" value={goal.id} />
          <Input
            key={goal.progressPercent}
            type="number"
            step="any"
            min="0"
            max="100"
            name="progressPercent"
            defaultValue={percent}
            aria-label={`Progress percent for ${goal.name}`}
            className="w-16 text-right tabular-nums"
          />
          <Button type="submit" variant="ghost" size="sm" disabled={isPending}>
            {isPending ? "…" : "Save"}
          </Button>
        </form>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-xs">
          {state.error}
        </p>
      )}
    </div>
  );
}

export function GoalRow({ goal, linkedHoldings }: { goal: Goal; linkedHoldings: LinkedHolding[] }) {
  /**
   * Progress is measured only against the holdings denominated in the goal's
   * own currency. Adding a dollar holding's minor units to a rupee target
   * would read as a 100× windfall, and converting it here would mean inventing
   * an FX rate — so anything in another currency is listed separately instead
   * of folded in. See docs/architecture/data-model.md.
   */
  const byCurrency = sumByCurrency(linkedHoldings);
  const linkedValueMinor = byCurrency.get(goal.currency) ?? 0;
  const otherCurrencies = [...byCurrency].filter(([currency]) => currency !== goal.currency);
  const targetMinor = goal.targetAmountMinor;
  const financialPercent =
    targetMinor && targetMinor > 0 ? (linkedValueMinor / targetMinor) * 100 : null;

  return (
    <TableRow>
      <TableCell>{goal.name}</TableCell>
      <TableCell className="text-muted-foreground">{PRIORITY_LABELS[goal.priority]}</TableCell>
      <TableCell className="tabular-nums">{goal.targetDate ?? "—"}</TableCell>
      <TableCell>
        {goal.type === "financial" ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {financialPercent !== null && <ProgressBar percent={financialPercent} />}
              <span className="text-sm tabular-nums">
                {linkedHoldings.length === 0
                  ? "No linked holdings"
                  : `${formatMoney({ minor: linkedValueMinor, currency: goal.currency })}${
                      targetMinor
                        ? ` / ${formatMoney({ minor: targetMinor, currency: goal.currency })}`
                        : ""
                    }`}
              </span>
            </div>
            {linkedHoldings.length > 0 && (
              <span className="text-muted-foreground text-xs">
                {linkedHoldings.map((h) => h.name).join(", ")}
              </span>
            )}
            {otherCurrencies.length > 0 && (
              <span className="text-muted-foreground text-xs">
                Not counted toward this {goal.currency} target:{" "}
                {otherCurrencies
                  .map(([currency, minor]) => formatMoney({ minor, currency }))
                  .join(", ")}
              </span>
            )}
          </div>
        ) : (
          <ProgressForm goal={goal} />
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{goal.note ?? ""}</TableCell>
    </TableRow>
  );
}
