"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addAccountAction, type AddAccountState } from "@/modules/finance/actions/domain/accounts";
import { ACCOUNT_TYPES, type AccountType } from "@/modules/finance/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddAccountState = {};

const LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
  credit_card: "Credit card",
  loan: "Loan",
  investment: "Investment",
  receivable: "Receivable (money owed to you)",
};

const LIABILITY_TYPES = new Set<AccountType>(["credit_card", "loan"]);

export function AccountForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, formAction, isPending] = useActionState(addAccountAction, initialState);
  const [type, setType] = useState<AccountType>("checking");
  const isLiability = LIABILITY_TYPES.has(type);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4">
      <FormField label="Name" htmlFor="name">
        <Input type="text" name="name" required />
      </FormField>

      <FormField label="Type" htmlFor="accountType">
        <select
          id="accountType"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label={isLiability ? "Amount currently owed" : "Opening balance"}
        htmlFor="openingBalance"
        hint={isLiability ? "Enter as a positive number" : undefined}
      >
        <Input
          type="number"
          step="any"
          name="openingBalance"
          defaultValue={0}
          className="tabular-nums"
        />
      </FormField>

      {isLiability && (
        <FormField label="Interest rate %" htmlFor="interestRate">
          <Input type="number" step="any" name="interestRate" className="tabular-nums" />
        </FormField>
      )}

      {type === "credit_card" && (
        <FormField label="Credit limit" htmlFor="creditLimit">
          <Input type="number" step="any" name="creditLimit" className="tabular-nums" />
        </FormField>
      )}

      {type === "loan" && (
        <>
          <FormField label="Original loan amount" htmlFor="originalAmount">
            <Input type="number" step="any" name="originalAmount" className="tabular-nums" />
          </FormField>
          <FormField label="EMI amount" htmlFor="emiAmount">
            <Input type="number" step="any" name="emiAmount" className="tabular-nums" />
          </FormField>
          <FormField label="Tenure (months)" htmlFor="tenureMonths">
            <Input type="number" name="tenureMonths" className="tabular-nums" />
          </FormField>
        </>
      )}

      {type === "receivable" && (
        <FormFieldAction label="Include in net worth">
          <div className="flex h-8 items-center gap-2">
            <input
              type="checkbox"
              name="includeInNetWorth"
              id="includeInNetWorth"
              className="size-4"
            />
            <label htmlFor="includeInNetWorth" className="text-sm font-medium">
              Include in net worth
            </label>
          </div>
        </FormFieldAction>
      )}

      <FormFieldAction label="Add account">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add account"}
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
