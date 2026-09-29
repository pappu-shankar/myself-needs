"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnlocked } from "@/modules/core/session/guard";
import {
  setAllocationTarget,
  setDateOfBirth,
  dismissGettingStartedChecklist,
} from "../../service/config/allocation";

const dobSchema = z.object({
  dateOfBirth: z.string().optional(),
});

export interface SetDateOfBirthState {
  error?: string;
}

export async function setDateOfBirthAction(
  _prevState: SetDateOfBirthState,
  formData: FormData,
): Promise<SetDateOfBirthState> {
  await requireUnlocked();
  const parsed = dobSchema.safeParse({ dateOfBirth: formData.get("dateOfBirth") || undefined });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid date of birth" };
  }

  setDateOfBirth(parsed.data.dateOfBirth ?? null);
  revalidatePath("/finance/settings");
  return {};
}

const targetSchema = z.object({
  assetClass: z.enum(["equity", "debt", "gold", "cash"]),
  targetPercentage: z.coerce.number().min(0).max(100),
});

export interface SetAllocationTargetState {
  error?: string;
}

export async function setAllocationTargetAction(
  _prevState: SetAllocationTargetState,
  formData: FormData,
): Promise<SetAllocationTargetState> {
  await requireUnlocked();
  const parsed = targetSchema.safeParse({
    assetClass: formData.get("assetClass"),
    targetPercentage: formData.get("targetPercentage"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid target" };
  }

  setAllocationTarget(parsed.data.assetClass, parsed.data.targetPercentage);
  revalidatePath("/finance/settings");
  return {};
}

/** No form fields — a single "skip" button on the finance hub's getting-started checklist. */
export async function dismissGettingStartedAction() {
  await requireUnlocked();
  dismissGettingStartedChecklist();
  revalidatePath("/finance");
}
