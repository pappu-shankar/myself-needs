"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnlocked } from "@/modules/core/session/guard";
import { createGoal, setGoalProgress } from "./service";
import { GOAL_TYPES, GOAL_PRIORITIES } from "./types";

const goalSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(GOAL_TYPES),
  priority: z.enum(GOAL_PRIORITIES),
  targetDate: z.string().optional(),
  targetAmount: z.coerce.number().positive().optional(),
  note: z.string().optional(),
});

export interface AddGoalState {
  error?: string;
}

export async function addGoalAction(
  _prevState: AddGoalState,
  formData: FormData,
): Promise<AddGoalState> {
  await requireUnlocked();
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

  createGoal({
    name: parsed.data.name,
    type: parsed.data.type,
    priority: parsed.data.priority,
    targetDate: parsed.data.targetDate ?? null,
    targetAmount: parsed.data.type === "financial" ? (parsed.data.targetAmount ?? null) : null,
    progressPercent: parsed.data.type === "other" ? 0 : null,
    note: parsed.data.note ?? null,
  });

  revalidatePath("/plans");
  revalidatePath("/dashboard");
  return {};
}

const progressSchema = z.object({
  id: z.coerce.number().int(),
  progressPercent: z.coerce.number().min(0).max(100),
});

export interface UpdateGoalProgressState {
  error?: string;
}

export async function updateGoalProgressAction(
  _prevState: UpdateGoalProgressState,
  formData: FormData,
): Promise<UpdateGoalProgressState> {
  await requireUnlocked();
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
}
