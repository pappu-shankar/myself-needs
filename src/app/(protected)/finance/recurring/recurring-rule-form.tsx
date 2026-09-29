"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { todayIso } from "@/lib/dates";
import {
  addRecurringRuleAction,
  type AddRecurringRuleState,
} from "@/modules/finance/actions/domain/recurring";
import {
  TRANSACTION_TYPES,
  RECURRING_FREQUENCIES,
  type TransactionType,
} from "@/modules/finance/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddRecurringRuleState = {};

interface RecurringRuleFormProps {
  accounts: { id: number; name: string }[];
  categories: { id: number; name: string; type: string }[];
  goals: { id: number; name: string }[];
  onSuccess?: () => void;
}

export function RecurringRuleForm({
  accounts,
  categories,
  goals,
  onSuccess,
}: RecurringRuleFormProps) {
  const [state, formAction, isPending] = useActionState(addRecurringRuleAction, initialState);
  const [type, setType] = useState<TransactionType>("expense");

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4">
      <FormField label="Type" htmlFor="recurringType">
        <select
          id="recurringType"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as TransactionType)}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label={type === "transfer" ? "From account" : "Account"}
        htmlFor="recurringAccountId"
      >
        <select
          id="recurringAccountId"
          name="accountId"
          required
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </FormField>

      {type === "transfer" ? (
        <FormField label="To account" htmlFor="recurringToAccountId">
          <select
            id="recurringToAccountId"
            name="toAccountId"
            required
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </FormField>
      ) : (
        <FormField label="Category" htmlFor="recurringCategoryId">
          <select
            id="recurringCategoryId"
            name="categoryId"
            required
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            {categories
              .filter((c) => c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </FormField>
      )}

      <FormField label="Amount" htmlFor="recurringAmount">
        <Input
          type="number"
          step="any"
          name="amount"
          id="recurringAmount"
          required
          className="tabular-nums"
        />
      </FormField>

      <FormField label="Frequency" htmlFor="frequency">
        <select
          id="frequency"
          name="frequency"
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {RECURRING_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {f[0].toUpperCase() + f.slice(1).replace("_", "-")}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Start date" htmlFor="startDate">
        <Input type="date" name="startDate" id="startDate" required defaultValue={todayIso()} />
      </FormField>
      <FormField label="End date" htmlFor="endDate" hint="Optional">
        <Input type="date" name="endDate" id="endDate" />
      </FormField>
      <FormField label="Note" htmlFor="recurringNote">
        <Input type="text" name="note" id="recurringNote" />
      </FormField>

      {goals.length > 0 && (
        <FormField label="Linked goal" htmlFor="recurringLinkedGoalId">
          <select
            id="recurringLinkedGoalId"
            name="linkedGoalId"
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            <option value="">Not linked</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <FormFieldAction label="Add recurring rule">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add recurring rule"}
        </Button>
      </FormFieldAction>

      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-4">
          {state.error}
        </p>
      )}
    </form>
  );
}
