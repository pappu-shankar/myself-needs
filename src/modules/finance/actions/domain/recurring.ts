"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zOptionalText, zPositiveAmount } from "@/lib/validation";
import {
  archiveRecurringRuleById,
  confirmRecurringOccurrence,
  createRecurringRule,
  deleteRecurringRuleById,
  editRecurringRule,
  getRecurringRule,
  pauseRecurringRuleById,
  resumeRecurringRuleById,
  unarchiveRecurringRuleById,
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

/**
 * Edit / pause / resume / archive / unarchive / delete.
 *
 * Only changed fields are sent; the service re-runs the create-time validation
 * on the merged rule. The amount converts with the **rule's own** currency,
 * read from the stored row — unless the source account itself is changing, in
 * which case the new account's currency applies, because that is what the rule
 * will be denominated in from then on. The service refuses the currency change
 * once the rule has confirmed transactions.
 */
const editRecurringRuleSchema = z.object({
  id: zId,
  type: z.enum(TRANSACTION_TYPES).optional(),
  accountId: zId.optional(),
  toAccountId: zId.optional(),
  categoryId: zId.optional(),
  amount: zPositiveAmount.optional(),
  frequency: z.enum(RECURRING_FREQUENCIES).optional(),
  startDate: zIsoDate.optional(),
  endDate: zIsoDate.optional(),
  note: zOptionalText(),
  linkedGoalId: zId.optional(),
});

export const editRecurringRuleAction = defineFormAction(
  editRecurringRuleSchema,
  (input) => {
    const rule = getRecurringRule(input.id);
    if (!rule) throw new DomainError("Recurring rule not found");

    const accountId = input.accountId ?? rule.accountId;
    const currency = getAccountCurrency(accountId);
    const type = input.type ?? rule.type;

    // A type change away from transfer clears the destination, and one toward
    // it clears the category — the same mutual exclusion the create schema
    // enforces, which the merged row still has to satisfy.
    const patch: Parameters<typeof editRecurringRule>[1] = {
      type: input.type,
      accountId: input.accountId,
      amountMinor: input.amount === undefined ? undefined : toMinor(input.amount, currency),
      currency: input.accountId === undefined ? undefined : currency,
      frequency: input.frequency,
      startDate: input.startDate,
      endDate: input.endDate,
      note: input.note,
      linkedGoalId: input.linkedGoalId,
    };
    if (type === "transfer") {
      if (input.toAccountId !== undefined) patch.toAccountId = input.toAccountId;
      if (input.type !== undefined) patch.categoryId = null;
    } else {
      if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
      if (input.type !== undefined) patch.toAccountId = null;
    }

    editRecurringRule(input.id, patch);
  },
  { name: "finance:edit-recurring-rule" },
);

/** Pausing stops future due periods on a rule that is still current; archiving
 * retires it. Both are offered because they are not the same thing. */
export const pauseRecurringRuleAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    pauseRecurringRuleById(input.id);
  },
  { name: "finance:pause-recurring-rule" },
);

export const resumeRecurringRuleAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    resumeRecurringRuleById(input.id);
  },
  { name: "finance:resume-recurring-rule" },
);

export const archiveRecurringRuleAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    archiveRecurringRuleById(input.id);
  },
  { name: "finance:archive-recurring-rule" },
);

export const unarchiveRecurringRuleAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    unarchiveRecurringRuleById(input.id);
  },
  { name: "finance:unarchive-recurring-rule" },
);

/** Refused by the service when a confirmed transaction or an insurance policy
 * references the rule. */
export const deleteRecurringRuleAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    deleteRecurringRuleById(input.id);
  },
  { name: "finance:delete-recurring-rule" },
);
