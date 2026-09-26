"use client";

import { useActionState } from "react";
import {
  updateTaxSettingsAction,
  type UpdateTaxSettingsState,
} from "@/modules/finance/actions/config/tax";
import type { getTaxSettingsView } from "@/modules/finance";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";

type TaxSettings = ReturnType<typeof getTaxSettingsView>;

const initialState: UpdateTaxSettingsState = {};

function NumberField({
  label,
  name,
  defaultValue,
  hint,
}: {
  label: string;
  name: keyof TaxSettings;
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

export function TaxSettingsForm({ settings }: { settings: TaxSettings }) {
  const [state, formAction, isPending] = useActionState(updateTaxSettingsAction, initialState);
  // Keyed by the displayed values (not `updatedAt`, whose second-level SQLite
  // resolution can repeat across two saves in the same second) so an
  // uncontrolled input's defaultValue is guaranteed to remount whenever the
  // saved data actually changes.
  const formKey = [
    settings.eightyCLimit,
    settings.eightyDLimit,
    settings.equityLtcgThresholdMonths,
    settings.equityLtcgExemption,
    settings.equityLtcgRate,
    settings.equityStcgRate,
    settings.otherLtcgThresholdMonths,
    settings.otherLtcgRate,
    settings.otherStcgRate,
    settings.standardDeductionOld,
    settings.standardDeductionNew,
    settings.cessPercent,
    settings.rebate87aThresholdOld,
    settings.rebate87aThresholdNew,
  ].join(",");

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4"
    >
      <NumberField label="80C limit" name="eightyCLimit" defaultValue={settings.eightyCLimit} />
      <NumberField label="80D limit" name="eightyDLimit" defaultValue={settings.eightyDLimit} />
      <NumberField
        label="Equity LTCG threshold (months)"
        name="equityLtcgThresholdMonths"
        defaultValue={settings.equityLtcgThresholdMonths}
      />
      <NumberField
        label="Equity LTCG exemption"
        name="equityLtcgExemption"
        defaultValue={settings.equityLtcgExemption}
      />
      <NumberField
        label="Equity LTCG rate %"
        name="equityLtcgRate"
        defaultValue={settings.equityLtcgRate}
      />
      <NumberField
        label="Equity STCG rate %"
        name="equityStcgRate"
        defaultValue={settings.equityStcgRate}
      />
      <NumberField
        label="Other LTCG threshold (months)"
        name="otherLtcgThresholdMonths"
        defaultValue={settings.otherLtcgThresholdMonths}
        hint="Non-equity holdings — debt, gold, and the rest"
      />
      <NumberField
        label="Other LTCG rate %"
        name="otherLtcgRate"
        defaultValue={settings.otherLtcgRate}
      />
      <NumberField
        label="Other STCG rate %"
        name="otherStcgRate"
        defaultValue={settings.otherStcgRate}
      />
      <NumberField
        label="Standard deduction (old)"
        name="standardDeductionOld"
        defaultValue={settings.standardDeductionOld}
      />
      <NumberField
        label="Standard deduction (new)"
        name="standardDeductionNew"
        defaultValue={settings.standardDeductionNew}
      />
      <NumberField label="Cess %" name="cessPercent" defaultValue={settings.cessPercent} />
      <NumberField
        label="87A rebate threshold (old)"
        name="rebate87aThresholdOld"
        defaultValue={settings.rebate87aThresholdOld}
        hint="Section 87A — taxable income at or below this owes zero tax"
      />
      <NumberField
        label="87A rebate threshold (new)"
        name="rebate87aThresholdNew"
        defaultValue={settings.rebate87aThresholdNew}
        hint="Section 87A — taxable income at or below this owes zero tax"
      />
      <div className="flex flex-col justify-end gap-1.5">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-3 lg:col-span-4">
          {state.error}
        </p>
      )}
    </form>
  );
}
