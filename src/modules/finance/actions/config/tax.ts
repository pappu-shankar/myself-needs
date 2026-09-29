"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnlocked } from "@/modules/core/session/guard";
import { setTaxSettings, editTaxSlabRate } from "../../service/config/tax";

const settingsSchema = z.object({
  eightyCLimit: z.coerce.number().min(0),
  eightyDLimit: z.coerce.number().min(0),
  equityLtcgThresholdMonths: z.coerce.number().int().min(0),
  equityLtcgExemption: z.coerce.number().min(0),
  equityLtcgRate: z.coerce.number().min(0).max(100),
  equityStcgRate: z.coerce.number().min(0).max(100),
  otherLtcgThresholdMonths: z.coerce.number().int().min(0),
  otherLtcgRate: z.coerce.number().min(0).max(100),
  otherStcgRate: z.coerce.number().min(0).max(100),
  standardDeductionOld: z.coerce.number().min(0),
  standardDeductionNew: z.coerce.number().min(0),
  cessPercent: z.coerce.number().min(0).max(100),
  rebate87aThresholdOld: z.coerce.number().min(0),
  rebate87aThresholdNew: z.coerce.number().min(0),
});

export interface UpdateTaxSettingsState {
  error?: string;
}

export async function updateTaxSettingsAction(
  _prevState: UpdateTaxSettingsState,
  formData: FormData,
): Promise<UpdateTaxSettingsState> {
  await requireUnlocked();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  }

  setTaxSettings(parsed.data);
  revalidatePath("/finance/settings");
  return {};
}

const slabRateSchema = z.object({
  id: z.coerce.number().int(),
  ratePercent: z.coerce.number().min(0).max(100),
});

export interface UpdateSlabRateState {
  error?: string;
}

export async function updateSlabRateAction(
  _prevState: UpdateSlabRateState,
  formData: FormData,
): Promise<UpdateSlabRateState> {
  await requireUnlocked();
  const parsed = slabRateSchema.safeParse({
    id: formData.get("id"),
    ratePercent: formData.get("ratePercent"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid rate" };
  }

  editTaxSlabRate(parsed.data.id, parsed.data.ratePercent);
  revalidatePath("/finance/settings");
  return {};
}
