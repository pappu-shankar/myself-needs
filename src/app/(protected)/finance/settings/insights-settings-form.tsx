"use client";

import { useActionState } from "react";
import {
  updateInsightsSettingsAction,
  type UpdateInsightsSettingsState,
} from "@/modules/finance/actions/config/insights";
import type { getInsightsSettingsView } from "@/modules/finance";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";

type InsightsSettings = ReturnType<typeof getInsightsSettingsView>;

const initialState: UpdateInsightsSettingsState = {};

function NumberField({
  label,
  name,
  defaultValue,
  hint,
}: {
  label: string;
  name: keyof InsightsSettings;
  defaultValue: number;
  hint?: string;
}) {
  return (
    <FormField label={label} htmlFor={name} hint={hint}>
      <Input
        type="number"
        step="any"
        name={name}
        id={name}
        defaultValue={defaultValue}
        className="tabular-nums"
      />
    </FormField>
  );
}

export function InsightsSettingsForm({ settings }: { settings: InsightsSettings }) {
  const [state, formAction, isPending] = useActionState(updateInsightsSettingsAction, initialState);
  const formKey = [
    settings.creditUtilizationThresholdPercent,
    settings.idleCashMonthsMultiple,
    settings.staleValuationDays,
    settings.recurringPileupThreshold,
    settings.budgetHeadroomPercent,
    settings.ltcgApproachingPercent,
  ].join(",");

  return (
    <form key={formKey} action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <NumberField
        label="Credit utilization threshold %"
        name="creditUtilizationThresholdPercent"
        defaultValue={settings.creditUtilizationThresholdPercent}
      />
      <NumberField
        label="Idle cash — months of expenses"
        name="idleCashMonthsMultiple"
        defaultValue={settings.idleCashMonthsMultiple}
      />
      <NumberField
        label="Stale valuation (days)"
        name="staleValuationDays"
        defaultValue={settings.staleValuationDays}
      />
      <NumberField
        label="Recurring pile-up threshold"
        name="recurringPileupThreshold"
        defaultValue={settings.recurringPileupThreshold}
        hint="Unconfirmed occurrences of a recurring rule before flagging"
      />
      <NumberField
        label="Budget headroom %"
        name="budgetHeadroomPercent"
        defaultValue={settings.budgetHeadroomPercent}
        hint="Flag a budget when spend is under (100 − this)% of its limit"
      />
      <NumberField
        label="LTCG approaching %"
        name="ltcgApproachingPercent"
        defaultValue={settings.ltcgApproachingPercent}
        hint="% of your LTCG exemption used before flagging"
      />
      <div className="flex flex-col justify-end gap-1.5">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save thresholds"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
