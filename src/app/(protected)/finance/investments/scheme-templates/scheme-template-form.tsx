"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  addSchemeTemplateAction,
  type AddSchemeTemplateState,
} from "@/modules/finance/actions/domain/scheme-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddSchemeTemplateState = {};

export function SchemeTemplateForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, formAction, isPending] = useActionState(addSchemeTemplateAction, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4">
      <FormField label="Name" htmlFor="schemeName">
        <Input type="text" name="name" id="schemeName" required />
      </FormField>
      <FormField label="Lock-in (months)" htmlFor="lockInMonths" hint="Optional">
        <Input type="number" name="lockInMonths" id="lockInMonths" className="tabular-nums" />
      </FormField>
      <FormField label="Interest rate %" htmlFor="schemeInterestRate" hint="Optional">
        <Input
          type="number"
          step="any"
          name="interestRate"
          id="schemeInterestRate"
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Notes" htmlFor="schemeNotes" hint="Optional">
        <Input type="text" name="notes" id="schemeNotes" />
      </FormField>
      <FormFieldAction label="Add scheme template">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add scheme template"}
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
