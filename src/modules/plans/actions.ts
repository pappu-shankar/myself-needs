"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import { createGoal, setGoalProgress } from "./service";
import { GOAL_TYPES, GOAL_PRIORITIES } from "./types";
import { toMinor } from "@/lib/format";
import { zPositiveAmount } from "@/lib/validation";

/**
 * Goals have no currency picker yet, so every goal is stored in the column's
 * default. It is named here instead of left implicit because the exponent
 * `toMinor` divides by and the currency the row is stored with have to be the
 * same one: converting at 100 paise and storing a 0-decimal currency is a
 * 100× error that nothing downstream can detect.
 */
const GOAL_CURRENCY = "INR";

const goalSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(GOAL_TYPES),
  priority: z.enum(GOAL_PRIORITIES),
  targetDate: z.string().optional(),
  /** What the user types is a major-unit decimal; `toMinor` below is the only
   * place it becomes the stored integer. */
  targetAmount: zPositiveAmount.optional(),
  note: z.string().optional(),
});

export interface AddGoalState {
  error?: string;
}

export const addGoalAction = defineFormAction(
  async (_prevState: AddGoalState, formData: FormData): Promise<AddGoalState> => {
    const parsed = goalSchema.safeParse({
      name: formData.get("name"),
      type: formData.get("type"),
      priority: formData.get("priority"),
      targetDate: formData.get("targetDate") || undefined,
      targetAmount: formData.get("targetAmount") || undefined,
      note: formData.get("note") || undefined,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid entry" };
    }

    const targetAmount = parsed.data.type === "financial" ? parsed.data.targetAmount : undefined;

    createGoal({
      name: parsed.data.name,
      type: parsed.data.type,
      priority: parsed.data.priority,
      targetDate: parsed.data.targetDate ?? null,
      targetAmountMinor: targetAmount != null ? toMinor(targetAmount, GOAL_CURRENCY) : null,
      currency: GOAL_CURRENCY,
      progressPercent: parsed.data.type === "other" ? 0 : null,
      note: parsed.data.note ?? null,
    });

    revalidatePath("/plans");
    revalidatePath("/dashboard");
    return {};
  },
);

const progressSchema = z.object({
  id: z.coerce.number().int(),
  progressPercent: z.coerce.number().min(0).max(100),
});

export interface UpdateGoalProgressState {
  error?: string;
}

export const updateGoalProgressAction = defineFormAction(
  async (
    _prevState: UpdateGoalProgressState,
    formData: FormData,
  ): Promise<UpdateGoalProgressState> => {
    const parsed = progressSchema.safeParse({
      id: formData.get("id"),
      progressPercent: formData.get("progressPercent"),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid progress" };
    }

    setGoalProgress(parsed.data.id, parsed.data.progressPercent);
    revalidatePath("/plans");
    return {};
  },
);
