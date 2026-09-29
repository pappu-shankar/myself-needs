"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { todayIso } from "@/lib/dates";
import {
  addTransactionAction,
  type AddTransactionState,
} from "@/modules/finance/actions/domain/transactions";
import { TRANSACTION_TYPES, type TransactionType } from "@/modules/finance/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddTransactionState = {};

interface TransactionFormProps {
  accounts: { id: number; name: string }[];
  categories: { id: number; name: string; type: string }[];
  onSuccess?: () => void;
}

export function TransactionForm({ accounts, categories, onSuccess }: TransactionFormProps) {
  const [state, formAction, isPending] = useActionState(addTransactionAction, initialState);
  const [type, setType] = useState<TransactionType>("expense");

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4">
      <FormField label="Type" htmlFor="transactionType">
        <select
          id="transactionType"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as TransactionType)}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label={type === "transfer" ? "From account" : "Account"} htmlFor="accountId">
        <select
          id="accountId"
          name="accountId"
          required
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </FormField>

      {type === "transfer" ? (
        <FormField label="To account" htmlFor="toAccountId">
          <select
            id="toAccountId"
            name="toAccountId"
            required
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </FormField>
      ) : (
        <FormField label="Category" htmlFor="categoryId">
          <select
            id="categoryId"
            name="categoryId"
            required
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            {categories
              .filter((c) => c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </FormField>
      )}

      <FormField label="Amount" htmlFor="amount">
        <Input type="number" step="any" name="amount" required className="tabular-nums" />
      </FormField>
      <FormField label="Date" htmlFor="date">
        <Input type="date" name="date" required defaultValue={todayIso()} />
      </FormField>
      <FormField label="Note" htmlFor="note">
        <Input type="text" name="note" />
      </FormField>

      <FormFieldAction label="Add transaction">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add transaction"}
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
