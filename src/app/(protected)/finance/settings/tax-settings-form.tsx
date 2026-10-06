"use client";

import { useActionState } from "react";
import { updateTaxSettingsAction } from "@/modules/finance/actions/config/tax";
import type { getTaxPolicyView } from "@/modules/finance";
import type { ActionState } from "@/modules/core/action/types";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { toMajor } from "@/lib/format";
import { fromRateBps } from "@/modules/finance/service/utility/units";
import { STATUTORY_TAX_CURRENCY as STATUTORY_CURRENCY } from "@/modules/finance/types";

type TaxSettings = ReturnType<typeof getTaxPolicyView>["settings"];

/**
 * The form shows the statutory figures the way the Finance Act states them —
 * rupees and percentages — while storage is INR paise and basis points. The two
 * maps below are the whole translation, in one place, so a field cannot be
 * displayed in one unit and submitted in another.
 *
 * Field *names* stay the major-unit ones, because they are what the action's
 * schema parses; the action converts.
 */
const MONEY_FIELDS = {
  eightyCLimit: "eightyCLimitMinor",
  eightyDLimit: "eightyDLimitMinor",
  equityLtcgExemption: "equityLtcgExemptionMinor",
  standardDeductionOld: "standardDeductionOldMinor",
  standardDeductionNew: "standardDeductionNewMinor",
  rebate87aThresholdOld: "rebate87aThresholdOldMinor",
  rebate87aThresholdNew: "rebate87aThresholdNewMinor",
} as const satisfies Record<string, keyof TaxSettings>;

const RATE_FIELDS = {
  equityLtcgRate: "equityLtcgRateBps",
  equityStcgRate: "equityStcgRateBps",
  otherLtcgRate: "otherLtcgRateBps",
  otherStcgRate: "otherStcgRateBps",
  cessPercent: "cessBps",
} as const satisfies Record<string, keyof TaxSettings>;

const MONTH_FIELDS = {
  equityLtcgThresholdMonths: "equityLtcgThresholdMonths",
  otherLtcgThresholdMonths: "otherLtcgThresholdMonths",
} as const satisfies Record<string, keyof TaxSettings>;

type FormFieldName =
  keyof typeof MONEY_FIELDS | keyof typeof RATE_FIELDS | keyof typeof MONTH_FIELDS;

/** The stored value for a form field, in the unit the field displays. */
function displayValue(settings: TaxSettings, name: FormFieldName): number {
  if (name in MONEY_FIELDS) {
    const stored = settings[MONEY_FIELDS[name as keyof typeof MONEY_FIELDS]];
    return toMajor(Number(stored), STATUTORY_CURRENCY);
  }
  if (name in RATE_FIELDS) {
    return fromRateBps(Number(settings[RATE_FIELDS[name as keyof typeof RATE_FIELDS]]));
  }
  return Number(settings[MONTH_FIELDS[name as keyof typeof MONTH_FIELDS]]);
}

const initialState: ActionState = {};

function NumberField({
  label,
  name,
  defaultValue,
  hint,
}: {
  label: string;
  name: FormFieldName;
  defaultValue: number | string;
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

/** One FY's settings. `editable` is false when the FY has no row of its own (the values shown are inherited from an earlier FY). */
export function TaxSettingsForm({
  fiscalYear,
  settings,
  editable,
}: {
  fiscalYear: string;
  settings: TaxSettings;
  editable: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateTaxSettingsAction, initialState);
  // After a failed save React resets the form, so refill it with what was submitted.
  const valueOf = (name: FormFieldName) => state.values?.[name] ?? displayValue(settings, name);
  // Keyed by the displayed values (not `updatedAt`, whose second-level SQLite
  // resolution can repeat across two saves in the same second) so an
  // uncontrolled input's defaultValue is guaranteed to remount whenever the
  // saved data actually changes — or a failed save echoes values back.
  const formKey = [
    state.error ? JSON.stringify(state.values) : "",
    fiscalYear,
    settings.eightyCLimitMinor,
    settings.eightyDLimitMinor,
    settings.equityLtcgThresholdMonths,
    settings.equityLtcgExemptionMinor,
    settings.equityLtcgRateBps,
    settings.equityStcgRateBps,
    settings.otherLtcgThresholdMonths,
    settings.otherLtcgRateBps,
    settings.otherStcgRateBps,
    settings.standardDeductionOldMinor,
    settings.standardDeductionNewMinor,
    settings.cessBps,
    settings.rebate87aThresholdOldMinor,
    settings.rebate87aThresholdNewMinor,
  ].join(",");

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4"
    >
      <input type="hidden" name="fiscalYear" value={fiscalYear} />
      <fieldset disabled={!editable} className="contents">
        <NumberField label="80C limit" name="eightyCLimit" defaultValue={valueOf("eightyCLimit")} />
        <NumberField label="80D limit" name="eightyDLimit" defaultValue={valueOf("eightyDLimit")} />
        <NumberField
          label="Equity LTCG threshold (months)"
          name="equityLtcgThresholdMonths"
          defaultValue={valueOf("equityLtcgThresholdMonths")}
        />
        <NumberField
          label="Equity LTCG exemption"
          name="equityLtcgExemption"
          defaultValue={valueOf("equityLtcgExemption")}
        />
        <NumberField
          label="Equity LTCG rate %"
          name="equityLtcgRate"
          defaultValue={valueOf("equityLtcgRate")}
        />
        <NumberField
          label="Equity STCG rate %"
          name="equityStcgRate"
          defaultValue={valueOf("equityStcgRate")}
        />
        <NumberField
          label="Other LTCG threshold (months)"
          name="otherLtcgThresholdMonths"
          defaultValue={valueOf("otherLtcgThresholdMonths")}
          hint="Non-equity holdings — debt, gold, and the rest"
        />
        <NumberField
          label="Other LTCG rate %"
          name="otherLtcgRate"
          defaultValue={valueOf("otherLtcgRate")}
        />
        <NumberField
          label="Other STCG rate %"
          name="otherStcgRate"
          defaultValue={valueOf("otherStcgRate")}
        />
        <NumberField
          label="Standard deduction (old)"
          name="standardDeductionOld"
          defaultValue={valueOf("standardDeductionOld")}
        />
        <NumberField
          label="Standard deduction (new)"
          name="standardDeductionNew"
          defaultValue={valueOf("standardDeductionNew")}
        />
        <NumberField label="Cess %" name="cessPercent" defaultValue={valueOf("cessPercent")} />
        <NumberField
          label="87A rebate threshold (old)"
          name="rebate87aThresholdOld"
          defaultValue={valueOf("rebate87aThresholdOld")}
          hint="Section 87A — taxable income at or below this owes zero tax"
        />
        <NumberField
          label="87A rebate threshold (new)"
          name="rebate87aThresholdNew"
          defaultValue={valueOf("rebate87aThresholdNew")}
          hint="Section 87A — taxable income at or below this owes zero tax"
        />
        <div className="flex flex-col justify-end gap-1.5">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : `Save FY ${fiscalYear}`}
          </Button>
        </div>
      </fieldset>
      {state.ok && (
        <p role="status" className="text-sm sm:col-span-3 lg:col-span-4">
          Saved FY {fiscalYear} settings.
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-3 lg:col-span-4">
          {state.error}
        </p>
      )}
    </form>
  );
}
