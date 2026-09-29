"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnlocked } from "@/modules/core/session/guard";
import { createBudget } from "../../service/domain/budgets";

const budgetSchema = z.object({
  categoryId: z.coerce.number().int(),
  monthlyLimit: z.coerce.number().positive("Monthly limit must be greater than 0"),
  effectiveFrom: z.string().min(1, "Effective from is required"),
});

export interface AddBudgetState {
  error?: string;
}

export async function addBudgetAction(
  _prevState: AddBudgetState,
  formData: FormData,
): Promise<AddBudgetState> {
  await requireUnlocked();
  const parsed = budgetSchema.safeParse({
    categoryId: formData.get("categoryId"),
    monthlyLimit: formData.get("monthlyLimit"),
    effectiveFrom: formData.get("effectiveFrom"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid budget" };
  }

  createBudget(parsed.data);

  revalidatePath("/finance");
  revalidatePath("/finance/budgets");
  return {};
}
