"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zOptionalText, zPositiveAmount, zText } from "@/lib/validation";
import { toMinor } from "@/lib/format";
import {
  correctTransaction,
  createTransaction,
  voidTransaction,
} from "../../service/domain/transactions";
import type { NewTransaction } from "../../db/queries/domain/transactions";
import { getAccountCurrency } from "../../service/domain/accounts";
import { TRANSACTION_TYPES } from "../../types";

export type AddTransactionState = ActionState;
export type VoidTransactionState = ActionState;
export type CorrectTransactionState = ActionState;

const transactionFields = {
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
};

/**
 * The cross-field rules, as one callback rather than a chain of `.refine`s, so
 * the correction form is validated by exactly the same rules as the add form.
 * A correction that could be entered through a laxer schema would be a way to
 * write a row the add path refuses.
 */
function checkTransactionRules(
  data: { type: string; accountId: number; toAccountId?: number; categoryId?: number },
  ctx: z.RefinementCtx,
) {
  if (data.type === "transfer") {
    if (data.toAccountId === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Destination account is required for transfers",
        path: ["toAccountId"],
      });
    } else if (data.toAccountId === data.accountId) {
      ctx.addIssue({
        code: "custom",
        message: "Source and destination accounts must be different",
        path: ["toAccountId"],
      });
    }
  } else if (data.categoryId === undefined) {
    ctx.addIssue({ code: "custom", message: "Category is required", path: ["categoryId"] });
  }
}

const transactionSchema = z.object(transactionFields).superRefine(checkTransactionRules);

/**
 * Form values to a ledger row. Currency is pinned at the account, so the
 * exponent to convert with is the account's, not an assumed two decimals.
 */
function toNewTransaction(input: z.output<typeof transactionSchema>): NewTransaction {
  const currency = getAccountCurrency(input.accountId);
  const toAccountId = input.type === "transfer" ? (input.toAccountId ?? null) : null;
  const toCurrency = toAccountId === null ? null : getAccountCurrency(toAccountId);
  const crossCurrency = toCurrency !== null && toCurrency !== currency;

  return {
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
  };
}

export const addTransactionAction = defineFormAction(
  transactionSchema,
  (input) => {
    createTransaction(toNewTransaction(input));
  },
  { name: "finance:add-transaction" },
);

/**
 * Reverses a transaction that should never have been entered. The reason is a
 * required field, not an optional note: a row marked reversed with no stated
 * reason is a correction trail that can't be audited, which is worse than the
 * wrong number it replaced.
 */
export const voidTransactionAction = defineFormAction(
  z.object({ id: zId, reason: zText("A reason") }),
  (input) => {
    voidTransaction(input.id, input.reason);
  },
  { name: "finance:void-transaction" },
);

/**
 * Corrects a transaction. The submitted row is the *replacement*; the service
 * voids the original, inserts this through the same validation `createTransaction`
 * uses, and points the voided row forward at the new one.
 */
export const correctTransactionAction = defineFormAction(
  z
    .object({ ...transactionFields, id: zId, reason: zText("A reason") })
    .superRefine(checkTransactionRules),
  (input) => {
    correctTransaction(input.id, toNewTransaction(input), input.reason);
  },
  { name: "finance:correct-transaction" },
);
