"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zOptionalText, zPositiveAmount } from "@/lib/validation";
import { createTransaction } from "../../service/domain/transactions";
import { TRANSACTION_TYPES } from "../../types";

export type AddTransactionState = ActionState;

const transactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES, { error: "Pick a transaction type" }),
    accountId: zId,
    toAccountId: zId.optional(),
    categoryId: zId.optional(),
    amount: zPositiveAmount,
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
    createTransaction({
      type: input.type,
      accountId: input.accountId,
      toAccountId: input.type === "transfer" ? (input.toAccountId ?? null) : null,
      categoryId: input.type === "transfer" ? null : (input.categoryId ?? null),
      amount: input.amount,
      date: input.date,
      note: input.note ?? null,
    });
  },
  { name: "finance:add-transaction" },
);
