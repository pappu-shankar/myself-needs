"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  addInsurancePolicyAction,
  type AddInsurancePolicyState,
} from "@/modules/finance/actions/domain/insurance";
import { INSURANCE_TYPES, RECURRING_FREQUENCIES } from "@/modules/finance/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddInsurancePolicyState = {};

interface InsuranceFormProps {
  recurringRules: { id: number; note: string | null }[];
  onSuccess?: () => void;
}

export function InsuranceForm({ recurringRules, onSuccess }: InsuranceFormProps) {
  const [state, formAction, isPending] = useActionState(addInsurancePolicyAction, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4">
      <FormField label="Type" htmlFor="insuranceType">
        <select
          id="insuranceType"
          name="type"
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {INSURANCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Provider" htmlFor="provider">
        <Input type="text" name="provider" id="provider" required />
      </FormField>
      <FormField label="Policy name" htmlFor="insuranceName">
        <Input type="text" name="name" id="insuranceName" required />
      </FormField>
      <FormField label="Policy number" htmlFor="policyNumber" hint="Optional">
        <Input type="text" name="policyNumber" id="policyNumber" />
      </FormField>

      <FormField label="Sum assured" htmlFor="sumAssured" hint="Optional">
        <Input
          type="number"
          step="any"
          name="sumAssured"
          id="sumAssured"
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Premium amount" htmlFor="premiumAmount">
        <Input
          type="number"
          step="any"
          name="premiumAmount"
          id="premiumAmount"
          required
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Premium frequency" htmlFor="premiumFrequency">
        <select
          id="premiumFrequency"
          name="premiumFrequency"
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {RECURRING_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {f[0].toUpperCase() + f.slice(1).replace("_", "-")}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Start date" htmlFor="insuranceStartDate">
        <Input
          type="date"
          name="startDate"
          id="insuranceStartDate"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
        />
      </FormField>

      <FormField label="Renewal date" htmlFor="renewalDate" hint="Optional">
        <Input type="date" name="renewalDate" id="renewalDate" />
      </FormField>
      <FormField label="Track premium via" htmlFor="recurringRuleId">
        <select
          id="recurringRuleId"
          name="recurringRuleId"
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          <option value="">Not tracked</option>
          {recurringRules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.note ?? `Rule #${r.id}`}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Notes" htmlFor="insuranceNotes" hint="Optional">
        <Input type="text" name="notes" id="insuranceNotes" />
      </FormField>

      <FormFieldAction label="80C eligible">
        <div className="flex h-8 items-center gap-2">
          <input type="checkbox" name="is80cEligible" id="is80cEligible" className="size-4" />
          <label htmlFor="is80cEligible" className="text-sm font-medium">
            80C eligible
          </label>
        </div>
      </FormFieldAction>
      <FormFieldAction label="80D eligible">
        <div className="flex h-8 items-center gap-2">
          <input type="checkbox" name="is80dEligible" id="is80dEligible" className="size-4" />
          <label htmlFor="is80dEligible" className="text-sm font-medium">
            80D eligible
          </label>
        </div>
      </FormFieldAction>

      <FormFieldAction label="Add policy">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add policy"}
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
