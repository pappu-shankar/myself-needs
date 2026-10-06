"use client";

import { useActionState, useState } from "react";
import {
  addHoldingAction,
  type AddHoldingState,
} from "@/modules/finance/actions/domain/investments";
import {
  INVESTMENT_TYPES,
  UNIT_PRICED_TYPES,
  ACCRUAL_TYPES,
  type InvestmentType,
} from "@/modules/finance/types";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddHoldingState = {};

const TYPE_LABELS: Record<InvestmentType, string> = {
  equity: "Equity",
  intl_equity: "International equity",
  mutual_fund_domestic: "Mutual fund (domestic)",
  mutual_fund_intl: "Mutual fund (international)",
  bond: "Bond",
  gold: "Gold",
  fd: "Fixed deposit",
  rd: "Recurring deposit",
  chit_fund: "Chit fund",
  govt_scheme: "Government scheme",
  other_asset: "Other (jewellery, silver, etc.)",
};

interface HoldingFormProps {
  accounts: { id: number; name: string }[];
  schemeTemplates: { id: number; name: string }[];
  goals: { id: number; name: string }[];
  onSuccess?: () => void;
}

export function HoldingForm({ accounts, schemeTemplates, goals, onSuccess }: HoldingFormProps) {
  const [state, formAction, isPending] = useActionState(addHoldingAction, initialState);
  const [type, setType] = useState<InvestmentType>("mutual_fund_domestic");

  useActionSuccess(state, () => onSuccess?.());
  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  const isUnitPriced = UNIT_PRICED_TYPES.has(type);
  const isAccrual = ACCRUAL_TYPES.has(type);
  const isGovtScheme = type === "govt_scheme";
  const isDomesticMf = type === "mutual_fund_domestic";

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4">
      <FormField label="Type" htmlFor="holdingType">
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as InvestmentType)}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {INVESTMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Name" htmlFor="holdingName" error={fieldError("name")}>
        <Input type="text" name="name" id="holdingName" required />
      </FormField>
      <FormField label="Account" htmlFor="holdingAccountId">
        <select
          name="accountId"
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          <option value="">Standalone (no account)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </FormField>

      {isUnitPriced && (
        <p className="text-muted-foreground text-sm sm:col-span-4">
          Units come from your buys and sells: after adding the holding, record each purchase as a
          contribution with its units.
        </p>
      )}

      {isAccrual && (
        <>
          <FormField
            label="Interest rate %"
            htmlFor="interestRate"
            error={fieldError("interestRate")}
          >
            <Input
              type="number"
              step="any"
              name="interestRate"
              id="interestRate"
              required
              className="tabular-nums"
            />
          </FormField>
          <FormField
            label="Maturity date"
            htmlFor="maturityDate"
            hint="Interest stops accruing here"
            error={fieldError("maturityDate")}
          >
            <Input type="date" name="maturityDate" id="maturityDate" />
          </FormField>
        </>
      )}

      {isGovtScheme && (
        <FormField label="Scheme template" htmlFor="schemeTemplateId">
          <select
            name="schemeTemplateId"
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            <option value="">None / custom</option>
            {schemeTemplates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      {isDomesticMf && (
        <FormField
          label="AMFI scheme code"
          htmlFor="externalCode"
          hint="Enables the Refresh NAV button"
          error={fieldError("externalCode")}
        >
          <Input type="text" inputMode="numeric" name="externalCode" id="externalCode" />
        </FormField>
      )}

      <FormField label="Notes" htmlFor="holdingNotes" hint="Optional">
        <Input type="text" name="notes" id="holdingNotes" />
      </FormField>

      <FormFieldAction label="80C eligible">
        <div className="flex h-8 items-center gap-2">
          <input
            type="checkbox"
            name="is80cEligible"
            id="holdingIs80cEligible"
            className="size-4"
          />
          <label htmlFor="holdingIs80cEligible" className="text-sm font-medium">
            80C eligible
          </label>
        </div>
      </FormFieldAction>

      {goals.length > 0 && (
        <FormField label="Linked goal" htmlFor="holdingLinkedGoalId">
          <select
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

      <FormFieldAction label="Add holding">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add holding"}
        </Button>
      </FormFieldAction>

      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-destructive text-sm sm:col-span-4">
          {state.error}
        </p>
      )}
    </form>
  );
}
