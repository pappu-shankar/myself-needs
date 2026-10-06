"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zOptionalText, zPositiveAmount } from "@/lib/validation";
import { toMinor } from "@/lib/format";
import { createTransaction } from "../../service/domain/transactions";
import { getAccountCurrency } from "../../service/domain/accounts";
import { TRANSACTION_TYPES } from "../../types";

export type AddTransactionState = ActionState;

const transactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES, { error: "Pick a transaction type" }),
    accountId: zId,
    toAccountId: zId.optional(),
    categoryId: zId.optional(),
    amount: zPositiveAmount,
    /** Only for a transfer between accounts in different currencies: what
     * actually landed. The rate is then implied by the two legs, so no rate
     * lookup can disagree with what the bank did. */
    toAmount: zPositiveAmount.optional(),
    date: zIsoDate,
    note: zOptionalText(),
  })
  .refine((data) => data.type !== "transfer" || data.toAccountId !== undefined, {
    message: "Destination account is required for transfers",
    path: ["toAccountId"],
  })
  .refine((data) => data.type === "transfer" || data.categoryId !== undefined, {
    message: "Category is required",
    path: ["categoryId"],
  })
  .refine((data) => data.type !== "transfer" || data.accountId !== data.toAccountId, {
    message: "Source and destination accounts must be different",
    path: ["toAccountId"],
  });

export const addTransactionAction = defineFormAction(
  transactionSchema,
  (input) => {
    // Currency is pinned at the account, so the exponent to convert with is
    // the account's, not an assumed two decimals.
    const currency = getAccountCurrency(input.accountId);
    const toAccountId = input.type === "transfer" ? (input.toAccountId ?? null) : null;
    const toCurrency = toAccountId === null ? null : getAccountCurrency(toAccountId);
    const crossCurrency = toCurrency !== null && toCurrency !== currency;

    createTransaction({
      type: input.type,
      accountId: input.accountId,
      toAccountId,
      categoryId: input.type === "transfer" ? null : (input.categoryId ?? null),
      amountMinor: toMinor(input.amount, currency),
      currency,
      // Both legs only where they mean something: the service rejects a second
      // leg on a same-currency transfer, since two sides of one movement could
      // then disagree.
      toAmountMinor:
        crossCurrency && input.toAmount !== undefined ? toMinor(input.toAmount, toCurrency) : null,
      toCurrency: crossCurrency ? toCurrency : null,
      date: input.date,
      note: input.note ?? null,
    });
  },
  { name: "finance:add-transaction" },
);
