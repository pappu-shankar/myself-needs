"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createTransaction } from "../../service/domain/transactions";
import { TRANSACTION_TYPES } from "../../types";

const transactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    accountId: z.coerce.number().int(),
    toAccountId: z.coerce.number().int().optional(),
    categoryId: z.coerce.number().int().optional(),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    date: z.string().min(1, "Date is required"),
    note: z.string().optional(),
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

export interface AddTransactionState {
  error?: string;
}

export async function addTransactionAction(
  _prevState: AddTransactionState,
  formData: FormData,
): Promise<AddTransactionState> {
  const parsed = transactionSchema.safeParse({
    type: formData.get("type"),
    accountId: formData.get("accountId"),
    toAccountId: formData.get("toAccountId") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    amount: formData.get("amount"),
    date: formData.get("date"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid transaction" };
  }

  createTransaction({
    type: parsed.data.type,
    accountId: parsed.data.accountId,
    toAccountId: parsed.data.type === "transfer" ? (parsed.data.toAccountId ?? null) : null,
    categoryId: parsed.data.type === "transfer" ? null : (parsed.data.categoryId ?? null),
    amount: parsed.data.amount,
    date: parsed.data.date,
    note: parsed.data.note ?? null,
  });

  revalidatePath("/finance");
  revalidatePath("/finance/transactions");
  revalidatePath("/dashboard");
  return {};
}
