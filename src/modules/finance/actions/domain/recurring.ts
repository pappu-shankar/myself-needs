"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zOptionalText, zPositiveAmount } from "@/lib/validation";
import { confirmRecurringOccurrence, createRecurringRule } from "../../service/domain/recurring";
import { TRANSACTION_TYPES, RECURRING_FREQUENCIES } from "../../types";

export type AddRecurringRuleState = ActionState;
export type ConfirmRecurringState = ActionState;

const recurringRuleSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES, { error: "Pick a transaction type" }),
    accountId: zId,
    toAccountId: zId.optional(),
    categoryId: zId.optional(),
    amount: zPositiveAmount,
    frequency: z.enum(RECURRING_FREQUENCIES, { error: "Pick a frequency" }),
    startDate: zIsoDate,
    endDate: zIsoDate.optional(),
    note: zOptionalText(),
    linkedGoalId: zId.optional(),
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

export const addRecurringRuleAction = defineFormAction(
  recurringRuleSchema,
  (input) => {
    createRecurringRule({
      type: input.type,
      accountId: input.accountId,
      toAccountId: input.type === "transfer" ? (input.toAccountId ?? null) : null,
      categoryId: input.type === "transfer" ? null : (input.categoryId ?? null),
      amount: input.amount,
      frequency: input.frequency,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      note: input.note ?? null,
      linkedGoalId: input.linkedGoalId ?? null,
    });
  },
  { name: "finance:add-recurring-rule" },
);

/**
 * `periodStart` is the due date the confirm form was pre-filled from (see
 * `DueWorklist`) — the service re-derives the live due worklist and rejects
 * anything not actually due before trusting it. See
 * `confirmRecurringOccurrence`.
 */
export const confirmRecurringAction = defineFormAction(
  z.object({
    ruleId: zId,
    periodStart: zIsoDate,
    amount: zPositiveAmount,
    date: zIsoDate,
    note: zOptionalText(),
  }),
  (input) => {
    confirmRecurringOccurrence({
      ruleId: input.ruleId,
      periodStart: input.periodStart,
      amount: input.amount,
      date: input.date,
      note: input.note ?? null,
    });
  },
  { name: "finance:confirm-recurring" },
);
