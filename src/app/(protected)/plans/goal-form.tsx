"use client";

import { useActionState, useState } from "react";
// Import directly from actions.ts, not the module's index.ts barrel — see
// docs/architecture/system-design.md.
import { addGoalAction, type AddGoalState } from "@/modules/plans/actions";
import {
  GOAL_TYPES,
  GOAL_PRIORITIES,
  type GoalType,
  type GoalPriority,
} from "@/modules/plans/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddGoalState = {};

const TYPE_LABELS: Record<GoalType, string> = {
  financial: "Financial",
  other: "Non-financial",
};

const PRIORITY_LABELS: Record<GoalPriority, string> = {
  must_have: "Must have",
  important: "Important",
  aspirational: "Aspirational",
};

export function GoalForm() {
  const [state, formAction, isPending] = useActionState(addGoalAction, initialState);
  const [type, setType] = useState<GoalType>("other");

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-5">
      <FormField label="Name" htmlFor="name" className="sm:col-span-2">
        <Input type="text" name="name" id="name" required />
      </FormField>

      <FormField label="Type" htmlFor="goalType">
        <select
          id="goalType"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as GoalType)}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {GOAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Priority" htmlFor="goalPriority">
        <select
          id="goalPriority"
          name="priority"
          defaultValue="important"
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {GOAL_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Target date" htmlFor="targetDate" hint="Optional">
        <Input type="date" name="targetDate" id="targetDate" />
      </FormField>

      {type === "financial" && (
        <FormField label="Target amount" htmlFor="targetAmount" hint="Optional">
          <Input
            type="number"
            step="any"
            name="targetAmount"
            id="targetAmount"
            className="tabular-nums"
          />
        </FormField>
      )}

      <FormField label="Note" htmlFor="note" hint="Optional" className="sm:col-span-2">
        <Input type="text" name="note" id="note" />
      </FormField>

      <FormFieldAction label="Add goal">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add goal"}
        </Button>
      </FormFieldAction>

      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-5">
          {state.error}
        </p>
      )}
    </form>
  );
}
