"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  addCategoryAction,
  type AddCategoryState,
} from "@/modules/finance/actions/domain/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddCategoryState = {};

export function CategoryForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, formAction, isPending] = useActionState(addCategoryAction, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
      <FormField label="Name" htmlFor="categoryName">
        <Input type="text" name="name" id="categoryName" required />
      </FormField>
      <FormField label="Type" htmlFor="categoryType">
        <select
          id="categoryType"
          name="type"
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </FormField>
      <FormFieldAction label="Add category">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add category"}
        </Button>
      </FormFieldAction>
      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
