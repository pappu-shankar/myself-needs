"use client";

import { useActionState } from "react";
import { addMedicationAction, type AddMedicationState } from "@/modules/health/actions/medications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddMedicationState = {};

export function MedicationForm() {
  const [state, formAction, isPending] = useActionState(addMedicationAction, initialState);

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3 lg:grid-cols-6"
    >
      <FormField label="Name" htmlFor="medName">
        <Input type="text" name="name" id="medName" required />
      </FormField>
      <FormField label="Dosage" htmlFor="medDosage" hint="Optional">
        <Input type="text" name="dosage" id="medDosage" placeholder="e.g. 500mg" />
      </FormField>
      <FormField
        label="Frequency"
        htmlFor="medFrequency"
        hint="Optional — a note for reference, not a reminder schedule"
      >
        <Input type="text" name="frequency" id="medFrequency" placeholder="e.g. twice daily" />
      </FormField>
      <FormField label="Start date" htmlFor="medStartDate">
        <Input
          type="date"
          name="startDate"
          id="medStartDate"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
        />
      </FormField>
      <FormField label="End date" htmlFor="medEndDate" hint="Optional">
        <Input type="date" name="endDate" id="medEndDate" />
      </FormField>
      <FormFieldAction label="Add medication">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add medication"}
        </Button>
      </FormFieldAction>
      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-3 lg:col-span-6">
          {state.error}
        </p>
      )}
    </form>
  );
}
