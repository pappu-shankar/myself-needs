"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zOptionalText, zPositiveAmount } from "@/lib/validation";
import {
  confirmRecurringOccurrence,
  createRecurringRule,
  getRecurringRule,
} from "../../service/domain/recurring";
import { TRANSACTION_TYPES, RECURRING_FREQUENCIES } from "../../types";
import { toMinor } from "@/lib/format";
import { DomainError } from "@/modules/core/errors";
import { getAccountCurrency } from "../../service/domain/accounts";

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
    const currency = getAccountCurrency(input.accountId);
    createRecurringRule({
      type: input.type,
      accountId: input.accountId,
      toAccountId: input.type === "transfer" ? (input.toAccountId ?? null) : null,
      categoryId: input.type === "transfer" ? null : (input.categoryId ?? null),
      amountMinor: toMinor(input.amount, currency),
      currency,
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
    /** Only for a cross-currency rule: what actually landed. */
    toAmount: zPositiveAmount.optional(),
    date: zIsoDate,
    note: zOptionalText(),
  }),
  (input) => {
    const rule = getRecurringRule(input.ruleId);
    if (!rule) throw new DomainError("Recurring rule not found");
    confirmRecurringOccurrence({
      ruleId: input.ruleId,
      periodStart: input.periodStart,
      amountMinor: toMinor(input.amount, rule.currency),
      toAmountMinor:
        input.toAmount === undefined || rule.toCurrency === null
          ? null
          : toMinor(input.toAmount, rule.toCurrency),
      date: input.date,
      note: input.note ?? null,
    });
  },
  { name: "finance:confirm-recurring" },
);
