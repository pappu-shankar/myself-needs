"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnlocked } from "@/modules/core/session/guard";
import { createSchemeTemplate } from "../../service/domain/scheme-templates";

const schemeTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  lockInMonths: z.coerce.number().int().positive().optional(),
  interestRate: z.coerce.number().optional(),
  notes: z.string().optional(),
});

export interface AddSchemeTemplateState {
  error?: string;
}

export async function addSchemeTemplateAction(
  _prevState: AddSchemeTemplateState,
  formData: FormData,
): Promise<AddSchemeTemplateState> {
  await requireUnlocked();
  const parsed = schemeTemplateSchema.safeParse({
    name: formData.get("name"),
    lockInMonths: formData.get("lockInMonths") || undefined,
    interestRate: formData.get("interestRate") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid scheme template" };
  }

  createSchemeTemplate({
    name: parsed.data.name,
    lockInMonths: parsed.data.lockInMonths ?? null,
    interestRate: parsed.data.interestRate ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/finance/investments/scheme-templates");
  revalidatePath("/finance/investments");
  return {};
}
