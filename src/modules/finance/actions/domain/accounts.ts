"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAccount } from "../../service/domain/accounts";
import { ACCOUNT_TYPES } from "../../types";

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(ACCOUNT_TYPES),
  openingBalance: z.coerce.number().default(0),
  creditLimit: z.coerce.number().optional(),
  interestRate: z.coerce.number().optional(),
  originalAmount: z.coerce.number().optional(),
  emiAmount: z.coerce.number().optional(),
  tenureMonths: z.coerce.number().int().optional(),
  /** Only meaningful for `receivable` — see account-form.tsx. */
  includeInNetWorth: z.coerce.boolean(),
});

export interface AddAccountState {
  error?: string;
}

export async function addAccountAction(
  _prevState: AddAccountState,
  formData: FormData,
): Promise<AddAccountState> {
  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    openingBalance: formData.get("openingBalance") || 0,
    creditLimit: formData.get("creditLimit") || undefined,
    interestRate: formData.get("interestRate") || undefined,
    originalAmount: formData.get("originalAmount") || undefined,
    emiAmount: formData.get("emiAmount") || undefined,
    tenureMonths: formData.get("tenureMonths") || undefined,
    includeInNetWorth: formData.get("includeInNetWorth") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid account" };
  }

  createAccount({
    name: parsed.data.name,
    type: parsed.data.type,
    openingBalance: parsed.data.openingBalance,
    creditLimit: parsed.data.creditLimit ?? null,
    interestRate: parsed.data.interestRate ?? null,
    originalAmount: parsed.data.originalAmount ?? null,
    emiAmount: parsed.data.emiAmount ?? null,
    tenureMonths: parsed.data.tenureMonths ?? null,
    excludeFromNetWorth: parsed.data.type === "receivable" && !parsed.data.includeInNetWorth,
  });

  revalidatePath("/finance");
  revalidatePath("/finance/accounts");
  revalidatePath("/dashboard");
  return {};
}
