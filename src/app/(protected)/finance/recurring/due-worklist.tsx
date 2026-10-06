"use client";

import { useActionState, useState } from "react";
import {
  confirmRecurringAction,
  type ConfirmRecurringState,
} from "@/modules/finance/actions/domain/recurring";
import type { getDueWorklist } from "@/modules/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";

type DueItem = ReturnType<typeof getDueWorklist>[number];

const initialState: ConfirmRecurringState = {};

function DueItemRow({ item }: { item: DueItem }) {
  const [expanded, setExpanded] = useState(false);
  const [state, formAction, isPending] = useActionState(confirmRecurringAction, initialState);

  const detail =
    item.type === "transfer"
      ? `${item.accountName} → ${item.toAccountName}`
      : `${item.accountName} · ${item.categoryName ?? "—"}`;
  const formId = `due-form-${item.ruleId}-${item.periodStart}`;

  return (
    <li className="border-border border-b py-3 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">{item.label}</p>
          <p className="text-muted-foreground text-sm">{detail}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={expanded}
          aria-controls={formId}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Cancel" : "Log"}
        </Button>
      </div>

      {expanded && (
        <form
          id={formId}
          action={formAction}
          className="mt-3 grid grid-cols-1 items-start gap-3 sm:grid-cols-4"
        >
          <input type="hidden" name="ruleId" value={item.ruleId} />
          <input type="hidden" name="periodStart" value={item.periodStart} />
          <FormField label="Amount" htmlFor={`amount-${item.ruleId}-${item.periodStart}`}>
            <Input
              type="number"
              step="any"
              name="amount"
              required
              defaultValue={item.suggestedAmount}
              className="tabular-nums"
            />
          </FormField>
          <FormField label="Date" htmlFor={`date-${item.ruleId}-${item.periodStart}`}>
            <Input type="date" name="date" required defaultValue={item.periodStart} />
          </FormField>
          <FormField label="Note" htmlFor={`note-${item.ruleId}-${item.periodStart}`}>
            <Input type="text" name="note" defaultValue={item.suggestedNote ?? ""} />
          </FormField>
          <FormFieldAction label="Confirm">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Logging…" : "Confirm"}
            </Button>
          </FormFieldAction>
          {state.error && (
            <p role="alert" className="text-destructive text-sm sm:col-span-4">
              {state.error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}

export function DueWorklist({ items }: { items: DueItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="All caught up" description="No recurring items due right now." />;
  }

  return (
    <ul>
      {items.map((item) => (
        <DueItemRow key={`${item.ruleId}-${item.periodStart}`} item={item} />
      ))}
    </ul>
  );
}
