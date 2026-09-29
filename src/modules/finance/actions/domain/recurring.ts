"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnlocked } from "@/modules/core/session/guard";
import { confirmRecurringOccurrence, createRecurringRule } from "../../service/domain/recurring";
import { TRANSACTION_TYPES, RECURRING_FREQUENCIES } from "../../types";

const recurringRuleSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    accountId: z.coerce.number().int(),
    toAccountId: z.coerce.number().int().optional(),
    categoryId: z.coerce.number().int().optional(),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    frequency: z.enum(RECURRING_FREQUENCIES),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().optional(),
    note: z.string().optional(),
    linkedGoalId: z.coerce.number().int().optional(),
  })
  .refine((data) => data.type !== "transfer" || data.toAccountId !== undefined, {
    message: "Destination account is required for transfers",
    path: ["toAccountId"],
  })
  .refine((data) => data.type === "transfer" || data.categoryId !== undefined, {
    message: "Category is required",
    path: ["categoryId"],
  });

export interface AddRecurringRuleState {
  error?: string;
}

export async function addRecurringRuleAction(
  _prevState: AddRecurringRuleState,
  formData: FormData,
): Promise<AddRecurringRuleState> {
  await requireUnlocked();
  const parsed = recurringRuleSchema.safeParse({
    type: formData.get("type"),
    accountId: formData.get("accountId"),
    toAccountId: formData.get("toAccountId") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    amount: formData.get("amount"),
    frequency: formData.get("frequency"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
    note: formData.get("note") || undefined,
    linkedGoalId: formData.get("linkedGoalId") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid recurring rule" };
  }

  createRecurringRule({
    type: parsed.data.type,
    accountId: parsed.data.accountId,
    toAccountId: parsed.data.type === "transfer" ? (parsed.data.toAccountId ?? null) : null,
    categoryId: parsed.data.type === "transfer" ? null : (parsed.data.categoryId ?? null),
    amount: parsed.data.amount,
    frequency: parsed.data.frequency,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate ?? null,
    note: parsed.data.note ?? null,
    linkedGoalId: parsed.data.linkedGoalId ?? null,
  });

  revalidatePath("/finance");
  revalidatePath("/finance/recurring");
  return {};
}

const confirmSchema = z.object({
  ruleId: z.coerce.number().int(),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: z.string().min(1, "Date is required"),
  note: z.string().optional(),
});

export interface ConfirmRecurringState {
  error?: string;
}

export async function confirmRecurringAction(
  _prevState: ConfirmRecurringState,
  formData: FormData,
): Promise<ConfirmRecurringState> {
  await requireUnlocked();
  const parsed = confirmSchema.safeParse({
    ruleId: formData.get("ruleId"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid entry" };
  }

  confirmRecurringOccurrence({
    ruleId: parsed.data.ruleId,
    amount: parsed.data.amount,
    date: parsed.data.date,
    note: parsed.data.note ?? null,
  });

  revalidatePath("/finance");
  revalidatePath("/finance/recurring");
  revalidatePath("/dashboard");
  return {};
}
