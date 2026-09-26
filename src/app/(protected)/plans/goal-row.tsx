"use client";

import { useActionState } from "react";
// Import directly from actions.ts, not the module's index.ts barrel — see
// docs/architecture/system-design.md.
import { updateGoalProgressAction, type UpdateGoalProgressState } from "@/modules/plans/actions";
import type { Goal, GoalPriority } from "@/modules/plans/types";
import { TableCell, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PRIORITY_LABELS: Record<GoalPriority, string> = {
  must_have: "Must have",
  important: "Important",
  aspirational: "Aspirational",
};

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export function GoalRow({
  goal,
  linkedHoldings,
}: {
  goal: Goal;
  linkedHoldings: { name: string; currentValue: number }[];
}) {
  const linkedValue = linkedHoldings.reduce((sum, h) => sum + h.currentValue, 0);
  const financialPercent =
    goal.targetAmount && goal.targetAmount > 0 ? (linkedValue / goal.targetAmount) * 100 : null;

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
                  : `${formatAmount(linkedValue)}${goal.targetAmount ? ` / ${formatAmount(goal.targetAmount)}` : ""}`}
              </span>
            </div>
            {linkedHoldings.length > 0 && (
              <span className="text-muted-foreground text-xs">
                {linkedHoldings.map((h) => h.name).join(", ")}
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
