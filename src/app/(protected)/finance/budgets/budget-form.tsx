"use client";

import { useActionState, useEffect, useRef } from "react";
import { addBudgetAction, type AddBudgetState } from "@/modules/finance/actions/domain/budgets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddBudgetState = {};

interface BudgetFormProps {
  categories: { id: number; name: string }[];
  onSuccess?: () => void;
}

export function BudgetForm({ categories, onSuccess }: BudgetFormProps) {
  const [state, formAction, isPending] = useActionState(addBudgetAction, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4">
      <FormField label="Category" htmlFor="budgetCategoryId">
        <select
          id="budgetCategoryId"
          name="categoryId"
          required
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Monthly limit" htmlFor="monthlyLimit">
        <Input
          type="number"
          step="any"
          min="0"
          name="monthlyLimit"
          id="monthlyLimit"
          required
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Effective from" htmlFor="effectiveFrom">
        <Input
          type="date"
          name="effectiveFrom"
          id="effectiveFrom"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
        />
      </FormField>
      <FormFieldAction label="Add budget">
        <Button type="submit" disabled={isPending || categories.length === 0}>
          {isPending ? "Adding…" : "Add budget"}
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
