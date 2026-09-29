"use client";

import { useActionState, useState } from "react";
import { todayIso } from "@/lib/dates";
import { addMetricAction, type AddMetricState } from "@/modules/health/actions/metrics";
import { HEALTH_METRIC_TYPES, DEFAULT_UNITS, type HealthMetricType } from "@/modules/health/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddMetricState = {};

const TYPE_LABELS: Record<HealthMetricType, string> = {
  weight: "Weight",
  sleep_hours: "Sleep",
  exercise_minutes: "Exercise",
  custom: "Custom",
};

export function MetricForm() {
  const [state, formAction, isPending] = useActionState(addMetricAction, initialState);
  const [type, setType] = useState<HealthMetricType>("weight");

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-5">
      <FormField label="Type" htmlFor="metricType">
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as HealthMetricType)}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {HEALTH_METRIC_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>

      {type === "custom" && (
        <FormField
          label="Label"
          htmlFor="metricLabel"
          hint="What you're tracking, e.g. Resting heart rate"
        >
          <Input type="text" name="label" id="metricLabel" required />
        </FormField>
      )}

      <FormField label="Date" htmlFor="metricDate">
        <Input type="date" name="date" id="metricDate" required defaultValue={todayIso()} />
      </FormField>
      <FormField
        label={`Value${DEFAULT_UNITS[type] ? ` (${DEFAULT_UNITS[type]})` : ""}`}
        htmlFor="metricValue"
      >
        <Input type="number" step="any" name="value" id="metricValue" className="tabular-nums" />
      </FormField>
      <FormField label="Note" htmlFor="metricNote" hint="Optional">
        <Input type="text" name="note" id="metricNote" />
      </FormField>

      <FormFieldAction label="Add entry">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add entry"}
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
